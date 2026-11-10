import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import pg from 'pg'
import { hashPassword, sealTotp } from '../../src/lib/server/admin-crypto.mjs'
import { claimJob } from '../../scripts/worker/queue.mjs'

const origin = 'http://127.0.0.1:34619'
const soakSeconds = Number(process.env.WEDDING_LOCAL_SOAK_SECONDS ?? 0)
assert.ok(Number.isInteger(soakSeconds) && soakSeconds >= 0 && soakSeconds <= 3600)
const env = Object.fromEntries(readFileSync('.env.compose.local', 'utf8').split(/\r?\n/)
  .filter(line => /^WEDDING_LOCAL_DB_(PASSWORD|PORT)=/.test(line))
  .map(line => line.split(/=(.*)/s).slice(0, 2)))
const dbUrl = new URL('postgresql://wedding_migrator@127.0.0.1:55432/wedding_dev')
dbUrl.port = env.WEDDING_LOCAL_DB_PORT || '55432'
dbUrl.password = env.WEDDING_LOCAL_DB_PASSWORD

function codeFor(secret) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const mac = createHmac('sha1', secret).update(counter).digest()
  return String((mac.readUInt32BE(mac[19] & 15) & 0x7fffffff) % 1000000).padStart(6, '0')
}

async function burst(label, count, request) {
  const times = await Promise.all(Array.from({ length: count }, async (_, index) => {
    const started = performance.now()
    const response = await request(index)
    assert.equal(response.status, 200)
    await response.arrayBuffer()
    return performance.now() - started
  }))
  times.sort((left, right) => left - right)
  const percentile = p => Math.round(times[Math.ceil(count * p) - 1])
  console.log(JSON.stringify({ label, count, p50Ms: percentile(.50), p95Ms: percentile(.95), p99Ms: percentile(.99) }))
}

function serverResources(pid) {
  if (process.platform !== 'win32') return null
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `Get-Process -Id ${pid} | Select-Object CPU,WorkingSet64,PrivateMemorySize64,HandleCount | ConvertTo-Json -Compress`],
  { encoding: 'utf8', windowsHide: true }))
}

test('admin API authenticates with MFA and scopes, rejects replay, and revokes sessions', { timeout: 45000 + soakSeconds * 1000 }, async () => {
  const client = new pg.Client({ connectionString: dbUrl.href })
  const event = randomUUID()
  const otherEvent = randomUUID()
  const actor = randomUUID()
  const email = `${actor}@example.invalid`
  const password = 'integration-fixture-password'
  const key = randomBytes(32)
  const secret = randomBytes(20)
  const session = new URL(dbUrl)
  session.searchParams.set('options', '-c role=wedding_api')
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '34619'], {
    env: { ...process.env, WEDDING_DATABASE_URL: session.href, WEDDING_APP_ORIGIN: origin,
      WEDDING_ADMIN_MFA_KEY: key.toString('hex'), NEXT_TELEMETRY_DISABLED: '1',
      R2_ACCOUNT_ID: '', R2_BUCKET: '', R2_JURISDICTION: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '' },
    stdio: 'ignore', windowsHide: true,
  })
  try {
    await client.connect()
    await client.query('INSERT INTO wedding.events (id, slug, title) VALUES ($1::uuid,$1::text,$3),($2::uuid,$2::text,$4)',
      [event, otherEvent, 'Authorized event', 'Other event'])
    await client.query('INSERT INTO wedding.users (id,email,password_hash,totp_encrypted) VALUES ($1,$2,$3,$4)',
      [actor, email, await hashPassword(password), sealTotp(secret, key, actor)])
    await client.query("INSERT INTO wedding.event_members VALUES ($1,$2,'owner')", [event, actor])

    const list = cookie => fetch(`${origin}/api/admin/events`, { headers: cookie ? { cookie } : {} })
    let ready
    for (let attempt = 0; attempt < 50; attempt++) {
      ready = await list().catch(() => null)
      if (ready) break
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    assert.equal(ready?.status, 401)
    assert.equal((await fetch(`${origin}/admin`)).status, 200)
    const alias = await fetch(`${origin}/${event}`, { redirect: 'manual' })
    assert.equal(alias.status, 307)
    assert.equal(alias.headers.get('location'), `/join/${event}`)
    const code = codeFor(secret)
    const login = (pass, requestOrigin = origin) => fetch(`${origin}/api/admin/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: requestOrigin },
      body: JSON.stringify({ email, password: pass, code }),
    })
    assert.equal((await login(password, 'https://other.invalid')).status, 403)
    assert.equal((await login('incorrect')).status, 401)
    const response = await login(password)
    assert.equal(response.status, 200)
    const rawCookie = response.headers.get('set-cookie')
    assert.match(rawCookie, /HttpOnly; Secure; SameSite=Strict/)
    const cookie = rawCookie.split(';')[0]
    assert.equal((await login(password)).status, 401)
    const events = await list(cookie)
    assert.equal(events.status, 200)
    assert.deepEqual((await events.json()).events.map(item => item.id), [event])
    const createLink = eventId => fetch(`${origin}/api/admin/events/${eventId}/guest-links`, {
      method: 'POST', headers: { Origin: origin, cookie },
    })
    assert.equal((await createLink(otherEvent)).status, 403)
    const linkResponse = await createLink(event)
    assert.equal(linkResponse.status, 201)
    const link = await linkResponse.json()
    const exchange = eventId => fetch(`${origin}/api/events/${eventId}/access`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: link.token }),
    })
    assert.equal((await exchange(otherEvent)).status, 403)
    const grant = await exchange(event)
    assert.equal(grant.status, 200)
    assert.equal(grant.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(grant.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(grant.headers.get('x-robots-tag'), 'noindex, nofollow')
    const guest = grant.headers.get('set-cookie').split(';')[0]
    if (process.env.WEDDING_LOCAL_BURST === '1') {
      for (const size of [50, 100, 300, 500]) {
        await burst('local guest page', size, () => fetch(`${origin}/join/${event}`))
      }
      await burst('local guest bootstrap', 100, () => fetch(`${origin}/api/events/${event}/access`, {
        method: 'POST', headers: { Origin: origin, cookie: guest, 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: '' }),
      }))
    }
    if (soakSeconds > 0) {
      const before = serverResources(child.pid)
      const deadline = performance.now() + soakSeconds * 1000
      let batches = 0
      while (performance.now() < deadline) {
        await burst('local guest soak', 20, index => fetch(`${origin}/${index % 2 ? 'join/' : ''}${event}`))
        batches++
        await new Promise(resolve => setTimeout(resolve, 4000))
      }
      console.log(JSON.stringify({ label: 'local guest soak total', requests: batches * 20, soakSeconds,
        before, after: serverResources(child.pid) }))
    }
    const book = eventId => `${origin}/api/events/${eventId}/guestbook`
    const message = { requestId: randomUUID(), message: 'Χρόνια πολλά!' }
    const post = eventId => fetch(book(eventId), {
      method: 'POST', headers: { Origin: origin, cookie: guest, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
    assert.equal((await post(otherEvent)).status, 403)
    assert.equal((await post(event)).status, 201)
    assert.equal((await post(event)).status, 200)
    assert.equal((await fetch(book(event), { headers: { cookie: guest } })).status, 404)
    const management = id => `${origin}/api/admin/events/${id}/manage`
    const patch = (id, body) => fetch(management(id), {
      method: 'PATCH', headers: { Origin: origin, cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const settings = { kind: 'settings', gallery_enabled: true, uploads_enabled: true, messages_enabled: true, voice_enabled: true }
    const profile = { kind: 'profile', title: 'Updated event', slug: event, date: '2027-06-12',
      welcome: 'Καλώς ήρθατε!', color: '#a67c52' }
    assert.equal((await patch(otherEvent, profile)).status, 404)
    assert.equal((await patch(event, profile)).status, 200)
    assert.equal((await (await exchange(event)).json()).settings.welcome_message, profile.welcome)
    assert.equal((await patch(otherEvent, settings)).status, 404)
    assert.equal((await patch(event, settings)).status, 200)
    const readBook = () => fetch(book(event), { headers: { cookie: guest } }).then(response => response.json())
    assert.deepEqual((await readBook()).messages, [])
    const dashboard = await fetch(management(event), { headers: { cookie } })
    assert.equal(dashboard.status, 200)
    const dashboardData = await dashboard.json()
    assert.equal(dashboardData.operations.database_ready, true)
    assert.equal(dashboardData.operations.storage_configured, false)
    assert.equal(dashboardData.operations.failed_uploads, 0)
    const records = dashboardData.messages
    assert.equal(records.length, 1)
    const moderation = { kind: 'message', id: records[0].id, state: 'approved' }
    assert.equal((await patch(otherEvent, moderation)).status, 404)
    assert.equal((await patch(event, moderation)).status, 200)
    assert.deepEqual((await readBook()).messages.map(item => item.message_text), [message.message])
    const display = id => fetch(`${origin}/api/admin/events/${id}/display`, { headers: { cookie } })
    assert.equal((await display(otherEvent)).status, 404)
    const approvedFeed = await display(event)
    assert.equal(approvedFeed.status, 200)
    assert.deepEqual((await approvedFeed.json()).messages.map(item => item.message_text), [message.message])
    assert.equal((await patch(event, { ...moderation, state: 'hidden' })).status, 200)
    assert.deepEqual((await (await display(event)).json()).messages, [])
    const exports = id => `${origin}/api/admin/events/${id}/exports`
    const queueExport = id => fetch(exports(id), { method: 'POST', headers: { Origin: origin, cookie } })
    assert.equal((await queueExport(otherEvent)).status, 404)
    assert.equal((await queueExport(event)).status, 202)
    assert.equal((await queueExport(event)).status, 409)
    const jobs = await fetch(exports(event), { headers: { cookie } }).then(response => response.json())
    assert.deepEqual(jobs.exports.map(job => job.state), ['queued'])
    assert.equal((await fetch(`${exports(event)}?download=${jobs.exports[0].id}`, { headers: { cookie } })).status, 404)
    await client.query('BEGIN')
    try {
      await client.query("UPDATE wedding.background_jobs SET run_at='2000-01-01' WHERE id=$1", [jobs.exports[0].id])
      await client.query('SET LOCAL ROLE wedding_worker')
      assert.equal(await claimJob(client, true), undefined)
      const claimed = await claimJob(client)
      assert.equal(claimed.id, jobs.exports[0].id)
      assert.equal(claimed.attempts, 1)
      await client.query("UPDATE wedding.background_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [claimed.id])
      const recovered = await claimJob(client)
      assert.equal(recovered.id, claimed.id)
      assert.equal(recovered.attempts, 2)
      assert.notEqual(recovered.lease, claimed.lease)
      assert.equal((await client.query("UPDATE wedding.background_jobs SET state='ready' WHERE id=$1 AND lease=$2",
        [claimed.id, claimed.lease])).rowCount, 0)
    } finally {
      await client.query('ROLLBACK')
    }
    const file = { requestId: randomUUID(), filename: 'test.jpg', type: 'image/jpeg', bytes: 100 }
    const init = (eventId, request = file) => fetch(`${origin}/api/events/${eventId}/uploads`, {
      method: 'POST', headers: { Origin: origin, cookie: guest, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    assert.equal((await init(otherEvent)).status, 403)
    assert.equal((await init(event)).status, 503)
    assert.equal((await init(event)).status, 503)
    assert.equal((await init(event, { ...file, bytes: 200 })).status, 409)
    const pending = await client.query('SELECT id,state FROM wedding.upload_sessions WHERE event_id=$1', [event])
    assert.equal(pending.rowCount, 1)
    assert.equal(pending.rows[0].state, 'pending')
    const receipt = await fetch(`${origin}/api/events/${event}/uploads/${pending.rows[0].id}`, {
      method: 'POST', headers: { Origin: origin, cookie: guest, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    })
    assert.equal(receipt.status, 503)
    assert.equal((await client.query('SELECT 1 FROM wedding.media WHERE event_id=$1', [event])).rowCount, 0)
    assert.equal((await fetch(`${origin}/api/admin/events/${event}/guest-links`, {
      method: 'DELETE', headers: { Origin: origin, cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: link.id }),
    })).status, 200)
    assert.equal((await init(event)).status, 403)
    assert.equal((await fetch(`${origin}/api/admin/session`, {
      method: 'DELETE', headers: { Origin: origin, cookie },
    })).status, 200)
    assert.equal((await list(cookie)).status, 401)
  } finally {
    child.kill()
    try {
      await client.query('DELETE FROM wedding.background_jobs WHERE event_id=$1', [event])
      await client.query('DELETE FROM wedding.admin_audit WHERE event_id=$1', [event])
      await client.query('DELETE FROM wedding.submissions WHERE event_id=$1', [event])
      await client.query('DELETE FROM wedding.event_settings WHERE event_id=$1', [event])
      await client.query('DELETE FROM wedding.upload_sessions WHERE event_id=$1', [event])
      await client.query('DELETE FROM wedding.guest_grants WHERE event_id=$1', [event])
      await client.query('DELETE FROM wedding.guest_links WHERE event_id=$1', [event])
      await client.query('DELETE FROM wedding.admin_sessions WHERE user_id=$1', [actor])
      await client.query('DELETE FROM wedding.event_members WHERE user_id=$1', [actor])
      await client.query('DELETE FROM wedding.users WHERE id=$1', [actor])
      await client.query('DELETE FROM wedding.events WHERE id IN ($1,$2)', [event, otherEvent])
      await client.query('DELETE FROM wedding.admin_login_limits WHERE bucket=$1',
        [createHash('sha256').update(email).digest('hex')])
    } finally {
      await client.end()
    }
  }
})

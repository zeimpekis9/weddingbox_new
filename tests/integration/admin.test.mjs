import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import pg from 'pg'
import { hashPassword, sealTotp } from '../../src/lib/server/admin-crypto.mjs'

const origin = 'http://127.0.0.1:34619'
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

test('admin API authenticates with MFA and scopes, rejects replay, and revokes sessions', { timeout: 45000 }, async () => {
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
      WEDDING_ADMIN_MFA_KEY: key.toString('hex'), NEXT_TELEMETRY_DISABLED: '1' },
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
    assert.equal((await fetch(`${origin}/api/admin/session`, {
      method: 'DELETE', headers: { Origin: origin, cookie },
    })).status, 200)
    assert.equal((await list(cookie)).status, 401)
  } finally {
    child.kill()
    try {
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

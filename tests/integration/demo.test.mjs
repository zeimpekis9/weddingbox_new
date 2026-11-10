import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import pg from 'pg'
import { chromium } from 'playwright-core'
import sharp from 'sharp'
import test from 'node:test'
import { bootstrapOwner, eventId, ownerEmail, ownerId } from '../../scripts/demo/bootstrap.mjs'
import { openDemoDatabase } from '../../scripts/demo/local.mjs'
import { seedDemo } from '../../scripts/demo/seed.mjs'
import { readR2Config } from '../../src/lib/server/r2-config.ts'
import { presets } from '../../src/lib/theme.mjs'

const enabled = process.env.WEDDING_DEMO_TEST === 'local-eu-staging'
const origin = 'http://localhost:34631'

function enrollmentCode(key) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = Array.from(key, letter => alphabet.indexOf(letter).toString(2).padStart(5, '0')).join('')
  const secret = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const hash = createHmac('sha1', secret).update(counter).digest()
  return String((hash.readUInt32BE(hash[19] & 15) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

test('demo enrolls the owner and exercises the live guest and ceremony APIs', { skip: !enabled, timeout: 75_000 }, async () => {
  const config = readR2Config()
  assert.ok(config?.bucket === 'weddingbox-staging' && process.env.R2_JURISDICTION === 'eu')
  const store = new S3Client(config)
  const name = `wedding_demo_test_${randomBytes(6).toString('hex')}`
  const { db, url } = await openDemoDatabase(name)
  const key = randomBytes(32)
  const invitation = randomBytes(32).toString('base64url')
  const password = randomBytes(3).toString('hex')
  const api = new URL(url)
  api.searchParams.set('options', '-c role=wedding_api')
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','34631'], {
    env: { ...process.env, WEDDING_APP_ORIGIN: origin, WEDDING_DATABASE_URL: api.href,
      WEDDING_ADMIN_MFA_KEY: key.toString('hex'), WEDDING_UPLOAD_ONLY: '0' },
    stdio: 'ignore', windowsHide: true,
  })
  const call = (path, cookie, body, method) => fetch(origin + path, {
    method: method ?? (body ? 'POST' : 'GET'), redirect: 'manual', signal: AbortSignal.timeout(10_000),
    headers: { Origin: origin, ...(cookie && { cookie }), ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const status = (response, expected) => assert.equal(response.status, expected, new URL(response.url).pathname)
  const login = (pass, code) => call('/api/admin/session', null, { email: ownerEmail, password: pass, code })
  const display = id => `/api/admin/events/${id}/display`
  let upload
  let browser
  const artworkKeys = []
  try {
    await seedDemo(db, invitation)
    const other = randomUUID()
    await db.query("INSERT INTO wedding.events(id,slug,title) VALUES ($1::uuid,$1::text,'Other fixture')", [other])
    for (let attempt = 0; attempt < 60; attempt++) {
      if ((await call('/api/health/ready').catch(() => null))?.ok) break
      await sleep(150)
    }
    status(await call('/api/health/ready'), 200)
    status(await login('admin', '000000'), 401)
    status(await call(display(eventId)), 404)

    let secret
    const setup = (replacement, code) => bootstrapOwner(db, key, async prompt => ({
      'Bootstrap username': 'admin', 'Bootstrap password': 'admin',
      'Replacement password': replacement, 'Confirm replacement password': replacement,
      'Authenticator code': code && secret ? enrollmentCode(secret) : 'invalid',
    })[prompt], value => { secret = value })
    await assert.rejects(setup('admin', false), /Use 6–24/)
    await assert.rejects(setup(password, false), /Invalid MFA/)
    assert.equal((await db.query('SELECT 1 FROM wedding.users WHERE id=$1', [ownerId])).rowCount, 0)
    assert.equal((await db.query('SELECT count(*)::int AS count FROM wedding.admin_sessions')).rows[0].count, 0)
    await setup(password, true)
    await bootstrapOwner(db, key, () => assert.fail('Rerun prompted for bootstrap credentials'), () => assert.fail('Rerun issued a secret'))
    assert.equal((await db.query('SELECT pending_hash FROM wedding_demo_bootstrap')).rows[0].pending_hash, null)
    const code = enrollmentCode(secret)
    status(await login('admin', code), 401)
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`${origin}/admin`)
    await page.getByLabel('Email').fill(ownerEmail)
    await page.getByLabel('Password').fill(password)
    await page.getByLabel('Authenticator code').fill(code)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('link', { name: 'Manage event' }).waitFor({ timeout: 8000 })
    const session = (await context.cookies()).find(cookie => cookie.name === '__Host-wedding_admin')
    assert.ok(session?.secure && session.httpOnly, 'Expected a secure owner session')
    const admin = `${session.name}=${session.value}`
    status(await login(password, code), 401)
    const events = await call('/api/admin/events', admin)
    assert.deepEqual((await events.json()).events.map(item => item.id), [eventId])
    status(await call(display(other), admin), 404)
    const manage = `/api/admin/events/${eventId}/manage`
    const dashboard = await call(manage, admin)
    status(dashboard, 200)
    const { stats, media } = await dashboard.json()
    assert.equal(stats.photos, 2)
    assert.equal(stats.videos, 1)
    assert.equal(stats.pending, 1)

    status(await call(`/api/events/${other}/access`, null, { link: invitation }), 403)
    const root = `/api/events/${eventId}`
    const access = await call(root + '/access', null, { link: invitation })
    status(access, 200)
    const guest = access.headers.get('set-cookie').split(';')[0]
    assert.equal((await access.json()).settings.theme.preset, 'christmas')
    const gallery = await call(root + '/gallery', guest)
    status(gallery, 200)
    assert.deepEqual((await gallery.json()).media.map(item => item.content_type).sort(), ['image/jpeg', 'video/mp4'])
    const video = await call(root + '/gallery?media=' + media.find(item => item.content_type === 'video/mp4').id, guest)
    status(video, 200)
    const videoFile = await fetch((await video.json()).url)
    assert.equal(videoFile.status, 200)
    assert.equal(Buffer.from(await videoFile.arrayBuffer()).subarray(4, 8).toString(), 'ftyp')
    assert.equal((await (await call(root + '/guestbook', guest)).json()).messages.length, 1)
    status(await call(root + '/guestbook', guest, { requestId: randomUUID(), message: 'Synthetic test greeting' }), 201)
    const pending = media.find(item => item.moderation === 'pending')
    status(await call(root + '/gallery?media=' + pending.id, guest), 404)
    status(await call(manage, admin, { kind: 'media', id: pending.id, state: 'approved' }, 'PATCH'), 200)
    await seedDemo(db, invitation)
    const feed = await call(display(eventId), admin)
    status(feed, 200)
    const ceremony = await feed.json()
    assert.equal(ceremony.theme.preset, 'christmas')
    assert.equal(ceremony.photos.length, 2)
    assert.equal(ceremony.messages.length, 1)
    const image = await fetch(ceremony.photos[0].url)
    assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format, 'webp')

    const photo = await sharp({ create: { width: 16, height: 16, channels: 3, background: 'pink' } }).jpeg().toBuffer()
    const init = await call(root + '/uploads', guest,
      { requestId: randomUUID(), filename: 'demo-test.jpg', type: 'image/jpeg', bytes: photo.length })
    status(init, 200)
    upload = await init.json()
    assert.match(upload.id, /^[a-f0-9-]{36}$/)
    const complete = () => call(root + '/uploads/' + upload.id, guest, { action: 'complete' })
    status(await complete(), 409)
    assert.equal((await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: photo })).status, 200)
    const receipt = await complete()
    status(receipt, 200)
    assert.deepEqual(await (await complete()).json(), await receipt.json())
    status(await call(`/api/events/${other}/gallery?media=${upload.id}`, guest), 404)

    const themePath = `/api/admin/events/${eventId}/theme`
    status(await call(themePath, guest), 404)
    status(await call(`/api/admin/events/${other}/theme`, admin), 404)
    status(await call(themePath, admin, { config: { ...presets.gold.config, font: 'url(test)' },
      revision: 1, publish: false }, 'PUT'), 422)
    const addArtwork = (kind, body) => fetch(`${origin}${themePath}/artwork?kind=${kind}`, {
      method: 'POST', headers: { Origin: origin, Cookie: admin, 'Content-Type': 'image/jpeg' }, body,
    })
    status(await addArtwork('cover', Buffer.from('<svg onload="bad()"/>')), 422)
    const ids = {}
    for (const kind of ['cover', 'monogram']) {
      const artwork = await addArtwork(kind, photo)
      status(artwork, 201)
      ids[kind] = (await artwork.json()).id
      assert.match(ids[kind], /^[a-f0-9-]{36}$/)
      artworkKeys.push(`events/${eventId}/theme/${ids[kind]}.webp`)
    }
    const asset = `${root}/theme-assets/${ids.cover}`
    status(await call(asset), 404)
    status(await call(asset, guest), 404)
    status(await call(asset, admin), 303)
    const custom = { ...presets.gold.config, ...ids }
    const saveTheme = (config, revision, publish) => call(themePath, admin, { config, revision, publish }, 'PUT')
    status(await saveTheme({ ...custom, monogram: ids.cover }, 1, false), 409)
    status(await saveTheme(custom, 1, false), 200)
    status(await saveTheme(custom, 1, true), 409)
    assert.equal((await (await call(root + '/access', guest, { link: '' })).json()).settings.theme.preset, 'christmas')
    status(await call(asset, guest), 404)
    status(await saveTheme(custom, 2, true), 200)
    const published = await call(root + '/access', guest, { link: '' })
    assert.deepEqual((await published.json()).settings.theme, custom)
    assert.equal((await (await call(display(eventId), admin)).json()).theme.preset, 'gold')
    status(await call(`/api/events/${other}/theme-assets/${ids.cover}`, admin), 404)
    const artwork = await call(asset, guest)
    status(artwork, 303)
    const artworkImage = await fetch(artwork.headers.get('location'))
    assert.equal((await sharp(Buffer.from(await artworkImage.arrayBuffer())).metadata()).format, 'webp')
    status(await saveTheme(presets.christmas.config, 3, true), 200)
    status(await call(asset, guest), 404)

    await page.getByRole('link', { name: 'Manage event' }).click()
    await page.getByRole('button', { name: 'Save event details' }).waitFor({ timeout: 8000 })
    await page.getByRole('link', { name: 'Open ceremony display' }).click()
    await page.getByRole('button', { name: 'Live messages' }).click()
    await page.getByText('Να ζήσετε! · Congratulations!', { exact: true }).waitFor({ timeout: 8000 })
  } finally {
    try {
      await browser?.close()
      for (const Key of artworkKeys) await store.send(new DeleteObjectCommand({ Bucket: config.bucket, Key }))
      if (/^[a-f0-9-]{36}$/.test(upload?.id ?? '')) {
        for (const area of ['staging','originals']) {
          await store.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: `events/${eventId}/${area}/${upload.id}` }))
        }
      }
    } finally {
      store.destroy()
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit')
        child.kill()
        await exited
      }
      await db.end()
      const source = new URL(url)
      source.pathname = 'wedding_dev'
      const cleanup = new pg.Client({ connectionString: source.href })
      await cleanup.connect()
      try { await cleanup.query(`DROP DATABASE ${name}`) } finally { await cleanup.end() }
    }
  }
})

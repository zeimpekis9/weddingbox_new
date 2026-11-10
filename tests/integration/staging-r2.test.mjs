import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { openAsBlob } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import test from 'node:test'

const enabled = process.env.WEDDING_STAGING_CONFIRM === 'isolated-staging'
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

function setup() {
  const origin = new URL(process.env.WEDDING_STAGING_URL)
  const { WEDDING_STAGING_EVENT: event, WEDDING_STAGING_OTHER_EVENT: otherEvent,
    WEDDING_STAGING_LINK: link, WEDDING_STAGING_ADMIN_COOKIE: admin,
    WEDDING_STAGING_PHOTO: photo, WEDDING_STAGING_VIDEO: video } = process.env
  assert.ok(origin.protocol === 'https:' && origin.href === origin.origin + '/', 'Expected isolated HTTPS origin')
  assert.ok(uuid.test(event) && uuid.test(otherEvent) && event !== otherEvent, 'Expected two staging event IDs')
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(link), 'Expected a staging guest link')
  assert.ok(/^__Host-wedding_admin=[A-Za-z0-9_-]{43}$/.test(admin), 'Expected a staging owner session cookie')
  assert.ok(photo && video, 'Expected synthetic JPEG and MP4 fixtures')
  return { base: origin.origin, event, otherEvent, link, admin, photo, video }
}

function signedUrl(value) {
  const url = new URL(value)
  assert.ok(url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    /^(?:[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\.)?[a-f0-9]{32}(?:\.eu)?\.r2\.cloudflarestorage\.com$/.test(url.hostname) &&
    url.searchParams.has('X-Amz-Signature'), 'Expected a signed R2 HTTPS URL')
  return url
}

async function checksum(stream) {
  const hash = createHash('sha256')
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

test('isolated staging R2 verifies receipts, resumed multipart, private originals and thumbnails',
  { skip: !enabled && 'Isolated staging credentials and fixtures are required', timeout: 240000 }, async () => {
    const { base,event,otherEvent,link,admin,photo,video } = setup()
    const root = `/api/events/${event}`
    function call(path, { body, method, cookie } = {}) {
      return fetch(base + path, {
        method: method ?? (body ? 'POST' : 'GET'), body: body ? JSON.stringify(body) : undefined,
        headers: { Origin: base, ...(body && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) },
        redirect: 'manual', signal: AbortSignal.timeout(20000),
      })
    }
    const access = await call(root + '/access', { body: { link } })
    assert.equal(access.status, 200)
    const guest = access.headers.get('set-cookie')?.split(';')[0]
    assert.ok(guest?.startsWith('__Host-wedding_guest='), 'Guest capability was issued')
    const settings = (await access.json()).settings
    assert.ok(settings.gallery_enabled, 'Enable the gallery on the isolated staging event')
    const photos = await openAsBlob(photo)
    const videos = await openAsBlob(video)
    assert.ok(photos.size > 0 && photos.size <= 25 * 1024 ** 2 && videos.size >= 32 * 1024 ** 2 &&
      videos.size <= 500 * 1024 ** 2, 'Expected fixtures within application limits')

    async function upload(file, type, mode) {
      const descriptor = { requestId: randomUUID(), filename: `staging-${randomUUID()}.${mode === 'single' ? 'jpg' : 'mp4'}`,
        type, bytes: file.size }
      const initialize = () => call(root + '/uploads', { body: descriptor, cookie: guest })
      const initialized = await initialize()
      assert.equal(initialized.status, 200)
      const start = await initialized.json()
      assert.equal(start.mode, mode)
      const path = `${root}/uploads/${start.id}`
      const action = body => call(path, { body, cookie: guest })
      assert.equal((await action({ action: 'complete' })).status, 409)
      if (mode === 'single') {
        const url = signedUrl(start.url)
        const preflight = await fetch(url, { method: 'OPTIONS', headers: {
          Origin: base, 'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type,if-none-match',
        }, redirect: 'manual', signal: AbortSignal.timeout(10000) })
        assert.equal(preflight.ok, true)
        assert.equal(preflight.headers.get('access-control-allow-origin'), base)
        assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /PUT/i)
        const uploaded = await fetch(url, { method: 'PUT', body: file, headers: start.headers,
          redirect: 'manual', signal: AbortSignal.timeout(30000) })
        assert.equal(uploaded.ok, true)
      } else {
        for (let offset = 0, part = 1; offset < file.size; offset += start.partSize, part++) {
          const signed = await action({ action: 'part', part })
          assert.equal(signed.status, 200)
          const uploaded = await fetch(signedUrl((await signed.json()).url), {
            method: 'PUT', body: file.slice(offset, offset + start.partSize), redirect: 'manual', signal: AbortSignal.timeout(30000),
          })
          assert.equal(uploaded.ok, true)
          if (part === 1) {
            const resume = await call(path, { cookie: guest })
            assert.equal(resume.status, 200)
            assert.deepEqual((await resume.json()).receivedParts, [1])
            const restarted = await initialize()
            assert.equal(restarted.status, 200)
            assert.equal((await restarted.json()).id, start.id)
          }
        }
      }
      let receipt
      for (let attempt = 0; attempt < 5; attempt++) {
        receipt = await action({ action: 'complete' })
        if (![202,503].includes(receipt.status)) break
        await sleep(2000)
      }
      assert.equal(receipt.status, 200)
      assert.deepEqual(await receipt.json(), { id: start.id, state: 'uploaded' })
      assert.deepEqual(await (await action({ action: 'complete' })).json(), { id: start.id, state: 'uploaded' })

      const manage = `/api/admin/events/${event}/manage`
      const signed = await call(`${manage}?media=${start.id}`, { cookie: admin })
      assert.equal(signed.status, 200)
      const url = signedUrl((await signed.json()).url)
      const anonymous = new URL(url)
      anonymous.search = ''
      assert.ok([401,403,404].includes((await fetch(anonymous, { redirect: 'manual', signal: AbortSignal.timeout(10000) })).status))
      const original = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000) })
      assert.equal(original.status, 200)
      assert.equal(await checksum(original.body), await checksum(file.stream()))
      assert.equal((await call(`/api/admin/events/${otherEvent}/manage?media=${start.id}`, { cookie: admin })).status, 404)
      assert.equal((await call(`${root}/gallery?media=${start.id}`, { cookie: guest })).status, 404)
      const approved = await call(manage, { method: 'PATCH', cookie: admin,
        body: { kind: 'media', id: start.id, state: 'approved' } })
      assert.equal(approved.status, 200)
      assert.equal((await call(`${root}/gallery?media=${start.id}`, { cookie: guest })).status, 200)
      const reopen = await call(`${root}/gallery?media=${start.id}&open=1`, { cookie: guest })
      assert.equal(reopen.status, 303)
      signedUrl(reopen.headers.get('location'))
      return start.id
    }

    const id = await upload(photos, 'image/jpeg', 'single')
    await upload(videos, 'video/mp4', 'multipart')
    let thumbnail
    for (let attempt = 0; attempt < 20; attempt++) {
      const gallery = await call(root + '/gallery', { cookie: guest })
      assert.equal(gallery.status, 200)
      thumbnail = (await gallery.json()).media.find(item => item.id === id)?.thumbnail
      if (thumbnail) break
      await sleep(1500)
    }
    assert.ok(thumbnail, 'The worker did not publish a verified thumbnail')
    const preview = await fetch(signedUrl(thumbnail), { redirect: 'manual', signal: AbortSignal.timeout(10000) })
    assert.equal(preview.status, 200)
    assert.equal(preview.headers.get('content-type'), 'image/webp')
  })

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'
import { chromium, devices, webkit } from 'playwright-core'

const engine = process.env.WEDDING_BROWSER === 'webkit' ? webkit : chromium
const port = engine === webkit ? '34622' : '34621'
const origin = `http://127.0.0.1:${port}`
const event = '10000000-0000-0000-0000-000000000001'
const link = 'a'.repeat(43)
const payload = { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255,216,255,219,0,0]) }

test('guest, gallery, guestbook, admin and display workflows use only first-party requests', { timeout: 45000 }, async () => {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', port], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true,
  })
  let browser
  try {
    let ready
    for (let attempt = 0; attempt < 50; attempt++) {
      ready = await fetch(`${origin}/join/${event}`).catch(() => null)
      if (ready) break
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    assert.equal(ready?.status, 200)
    browser = await engine.launch(engine === chromium ? { channel: 'chrome', headless: true } : { headless: true })
    const userAgent = devices[engine === webkit ? 'iPhone 13' : 'Pixel 7'].userAgent
    const page = await browser.newPage({ viewport: { width: 390, height: 740 }, isMobile: true, hasTouch: true, userAgent })
    const foreignOrigins = new Set()
    await page.route('**/*', route => {
      const requestOrigin = new URL(route.request().url()).origin
      if (requestOrigin === origin) return route.continue()
      foreignOrigins.add(requestOrigin)
      return route.abort()
    })
    const requestIds = []
    const requestedParts = []
    let allowReceipt = false
    await page.route('**/api/events/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path.endsWith('/access')) return route.fulfill({ json: { authorized: true, settings: {
        uploads_enabled: true, gallery_enabled: true, messages_enabled: true, voice_enabled: false,
      } } })
      if (path.endsWith('/gallery')) return route.fulfill({ json: { media: [], next: null } })
      if (path.endsWith('/guestbook')) return route.fulfill({ json: request.method() === 'GET' ?
        { messages: [{ id: 'one', message_text: 'An approved message' }] } : { received: true } })
      if (path.endsWith('/uploads')) {
        const upload = request.postDataJSON()
        requestIds.push(upload.requestId)
        if (upload.filename === 'second-photo.jpg') assert.equal(upload.type, 'image/jpeg')
        if (upload.type === 'video/mp4') return route.fulfill({ json: {
          id: 'fixture-video', state: 'pending', mode: 'multipart', partSize: 4,
        } })
        return route.fulfill({ json: { id: 'fixture', state: 'pending', mode: 'single',
          url: `${origin}/mock-storage`, headers: { 'If-None-Match': '*' } } })
      }
      const id = path.split('/').at(-1)
      if (request.method() === 'GET') return route.fulfill({ json: { state: 'pending', active: true, staged: false,
        receivedParts: id === 'fixture-video' ? [1] : [] } })
      const action = request.postDataJSON()
      if (action.action === 'part') {
        requestedParts.push(action.part)
        return route.fulfill({ json: { url: `${origin}/mock-part` } })
      }
      return allowReceipt ? route.fulfill({ json: { id, state: 'uploaded' } }) :
        route.fulfill({ status: 409, json: { error: 'incomplete' } })
    })
    await page.route('**/mock-storage', async route => {
      assert.equal(route.request().headers()['if-none-match'], '*')
      await route.fulfill({ status: 200 })
    })
    await page.route('**/mock-part', route => route.fulfill({ status: 200 }))
    await page.goto(`${origin}/join/${event}#${link}`)
    await page.getByLabel('Τραβήξτε φωτογραφία', { exact: true }).waitFor({ state: 'attached' })
    const selectEnglish = () => page.getByRole('button', { name: 'Ελληνικά / English' }).click()
    await selectEnglish()
    const picker = page.getByLabel('Choose photos and videos', { exact: true })
    const camera = page.getByLabel('Take picture', { exact: true })
    assert.equal(await picker.getAttribute('capture'), null)
    assert.equal(await camera.getAttribute('capture'), 'environment')
    assert.equal(await camera.getAttribute('accept'), 'image/*')
    assert.equal(await camera.getAttribute('multiple'), null)
    await picker.setInputFiles(payload)
    await page.getByText('Upload interrupted', { exact: true }).waitFor()
    assert.equal(await page.getByText('Received', { exact: true }).count(), 0)
    assert.equal(new URL(page.url()).hash, '')
    await page.reload()
    await selectEnglish()
    allowReceipt = true
    await camera.setInputFiles(payload)
    await page.getByText('Received', { exact: true }).waitFor()
    assert.equal(requestIds.length, 2)
    assert.equal(requestIds[0], requestIds[1])
    await picker.setInputFiles([
      { ...payload, name: 'second-photo.jpg', mimeType: '' },
      { name: 'video.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(10, 1) },
    ])
    await page.getByText('Received 2 / 2', { exact: true }).waitFor()
    assert.deepEqual(requestedParts, [2,3])
    await page.getByRole('button', { name: 'Browse gallery' }).click()
    await page.getByText('An approved message', { exact: true }).waitFor()
    await page.getByLabel('Guestbook message').fill('A new message')
    await page.getByRole('button', { name: 'Send message' }).click()
    await page.getByText('Message received.', { exact: true }).waitFor()

    let authenticated = false
    await page.route('**/api/admin/session', route => {
      authenticated = route.request().method() === 'POST'
      return route.fulfill({ json: { authenticated } })
    })
    await page.route('**/api/admin/events', route => authenticated ?
      route.fulfill({ json: { events: [{ id: event, title: 'Test event', slug: 'fixture', role: 'owner' }] } }) :
      route.fulfill({ status: 401, json: { error: 'Unauthorized' } }))
    await page.goto(`${origin}/admin`)
    await page.getByLabel('Email').fill('owner@example.invalid')
    await page.getByLabel('Password').fill('fixture-password')
    await page.getByLabel('Authenticator code').fill('123456')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('link', { name: 'Manage event' }).waitFor()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.getByRole('button', { name: 'Sign in' }).waitFor()

    let online = true
    await page.route('**/api/admin/events/*/display', route => online
      ? route.fulfill({ json: { title: 'Test event', owner: false, photos: [],
        messages: [{ id: 'approved', message_text: 'Approved for the ceremony' }] } })
      : route.fulfill({ status: 503, json: { error: 'offline' } }))
    await page.goto(`${origin}/admin/local/${event}/display`)
    await page.getByRole('button', { name: 'Live messages' }).click()
    const shown = page.getByText('Approved for the ceremony', { exact: true })
    await shown.waitFor()
    online = false
    await page.getByText('Reconnecting…', { exact: true }).waitFor()
    assert.equal(await shown.count(), 1)
    assert.deepEqual([...foreignOrigins], [])
  } finally {
    await browser?.close()
    child.kill()
  }
})

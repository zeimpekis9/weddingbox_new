import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'
import { chromium } from 'playwright-core'

const origin = 'http://127.0.0.1:34621'
const event = '10000000-0000-0000-0000-000000000001'
const link = 'a'.repeat(43)
const payload = { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255,216,255,219,0,0]) }

test('guest, gallery, guestbook, admin and display workflows use only first-party requests', { timeout: 45000 }, async () => {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '34621'], {
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
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 390, height: 740 }, isMobile: true })
    const foreignOrigins = new Set()
    await page.route('**/*', route => {
      const requestOrigin = new URL(route.request().url()).origin
      if (requestOrigin === origin) return route.continue()
      foreignOrigins.add(requestOrigin)
      return route.abort()
    })
    const requestIds = []
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
        requestIds.push(request.postDataJSON().requestId)
        return route.fulfill({ json: { id: 'fixture', state: 'pending', mode: 'single',
          url: `${origin}/mock-storage`, headers: { 'If-None-Match': '*' } } })
      }
      if (request.method() === 'GET') return route.fulfill({ json: { state: 'pending', active: true, staged: false } })
      return allowReceipt ? route.fulfill({ json: { id: 'fixture', state: 'uploaded' } }) :
        route.fulfill({ status: 409, json: { error: 'incomplete' } })
    })
    await page.route('**/mock-storage', async route => {
      assert.equal(route.request().headers()['if-none-match'], '*')
      await route.fulfill({ status: 200 })
    })
    await page.goto(`${origin}/join/${event}#${link}`)
    const selectEnglish = () => page.getByRole('button', { name: 'Ελληνικά / English' }).click()
    await selectEnglish()
    await page.locator('input[type=file]').setInputFiles(payload)
    await page.getByText('Upload interrupted', { exact: true }).waitFor()
    assert.equal(await page.getByText('Received', { exact: true }).count(), 0)
    assert.equal(new URL(page.url()).hash, '')
    await page.reload()
    await selectEnglish()
    allowReceipt = true
    await page.locator('input[type=file]').setInputFiles(payload)
    await page.getByText('Received', { exact: true }).waitFor()
    assert.equal(requestIds.length, 2)
    assert.equal(requestIds[0], requestIds[1])
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

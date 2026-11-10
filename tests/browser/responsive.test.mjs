import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { chromium, devices, webkit } from 'playwright-core'
import sharp from 'sharp'

const port = process.env.WEDDING_BROWSER === 'webkit' ? '34624' : '34623'
const origin = `http://127.0.0.1:${port}`
const event = '10000000-0000-0000-0000-000000000001'
const title = 'Αλεξάνδρα & Κωνσταντίνος'
const filename = 'wedding-photo-' + 'long-name-'.repeat(12) + '.jpg'
const settings = { title, uploads_enabled: true, gallery_enabled: true, messages_enabled: true, voice_enabled: true }
const sizes = [[320,640],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1440,900],[568,320],[844,390]]
const picture = await sharp({
  create: { width: 1600, height: 900, channels: 3, background: '#d4b896' },
}).png().toBuffer()
const screen = { title, owner: true, photos: [],
  messages: [{ id: 'm', message_text: 'Χρόνια πολλά! '.repeat(45) }] }

async function installFixtures(page, signedIn) {
  await page.route('**/fixture-picture', route => route.fulfill({ contentType: 'image/png', body: picture }))
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/access')) return route.fulfill({ json: { authorized: true, settings } })
    if (path.endsWith('/gallery')) return route.fulfill({ json: url.searchParams.has('media') ?
      { url: origin + '/fixture-picture' } : { media: [{ id: event, filename, content_type: 'image/png',
        thumbnail: origin + '/fixture-picture' }], next: null } })
    if (path.endsWith('/guestbook')) return route.fulfill({ json: { messages: [] } })
    if (path === '/api/admin/events') return signedIn ?
      route.fulfill({ json: { events: [{ id: event, title, role: 'owner' }] } }) :
      route.fulfill({ status: 401, json: {} })
    if (path.endsWith('/guest-links')) return route.fulfill({ json: route.request().method() === 'DELETE' ?
      { revoked: true } : { id: event, token: 'a'.repeat(43) } })
    if (path.endsWith('/manage')) return route.fulfill({ json: url.searchParams.has('media') ?
      { url: origin + '/fixture-picture' } : {
        event: { title, role: 'owner' }, profile: { slug: 'wedding', event_date: null, primary_color: null },
        settings, stats: { photos: 1, videos: 0, pending: 1, bytes: '100' }, operations: {
          pending_uploads: 1, failed_uploads: 0, queued_jobs: 0, failed_jobs: 0, database_ready: true, storage_configured: false,
        }, media: [{ id: event, filename, content_type: 'image/png', moderation: 'pending' }],
        messages: [{ id: 'm', message_text: 'Συγχαρητήρια! '.repeat(12), moderation: 'approved' }],
        logs: [{ operation: 'media:approved', created_at: '2026-10-01T00:00:00Z' }],
      } })
    if (path.endsWith('/display')) return route.fulfill({ json: screen })
    if (path.endsWith('/exports')) return route.fulfill({ json: { exports: [] } })
    return route.fulfill({ status: 404, json: {} })
  })
}

async function noOverflow(page, name) {
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth
    return { width, pageWidth: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll('button, input:not(.sr-only), select, textarea, [role=dialog]')]
      .filter(node => node.getClientRects().length > 0).filter(node => {
        const box = node.getBoundingClientRect()
        return box.left < -1 || box.right > width + 1
      }).map(node => node.textContent?.trim().slice(0, 45) || node.getAttribute('name')) }
  })
  assert.ok(result.pageWidth <= result.width + 1 && !result.offenders.length, `${name}: ${JSON.stringify(result)}`)
}

test('responsive public, guest, owner and ceremony screens', { timeout: 180000 }, async () => {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',port],
    { env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'ignore', windowsHide: true })
  const engine = process.env.WEDDING_BROWSER === 'webkit' ? webkit : chromium
  let browser
  try {
    let ready
    for (let attempt = 0; attempt < 50; attempt++) {
      ready = await fetch(origin).catch(() => null)
      if (ready?.ok) break
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    assert.ok(ready?.ok)
    browser = await engine.launch(engine === chromium ? { channel: 'chrome', headless: true } : { headless: true })
    console.log(`${engine.name()} ${browser.version()}`)
    const output = process.env.WEDDING_SCREENSHOT_DIR
    if (output) await mkdir(output, { recursive: true })
    for (const [width,height] of sizes) {
      const isMobile = width < 768 || height < 500
      const userAgent = isMobile ? devices[engine === webkit ? 'iPhone 13' : 'Pixel 7'].userAgent : undefined
      const page = await browser.newPage({ viewport: { width,height }, isMobile, userAgent, hasTouch: width <= 1024 })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', entry => {
        if (entry.type() === 'error' && /hydration|did not match/i.test(entry.text())) errors.push(entry.text())
      })
      await installFixtures(page, false)
      async function verify(name) {
        await noOverflow(page, `${name} ${width}x${height}`)
        if (output) await page.screenshot({ path: join(output, `${engine.name()}-${name}-${width}x${height}.png`),
          fullPage: !name.endsWith('dialog'), animations: 'disabled' })
      }
      try {
        await page.goto(origin)
        await verify('home')
        await page.goto(`${origin}/admin`)
        await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor()
        await verify('login')
        await page.goto(`${origin}/join/${event}`)
        const chooser = page.getByLabel('Επιλέξτε φωτογραφίες και βίντεο')
        await chooser.waitFor()
        const primary = await chooser.locator('..').boundingBox()
        assert.ok(primary.height >= 44 && primary.y + primary.height < height)
        await verify('guest')
        await page.getByRole('button', { name: 'Ελληνικά / English' }).click()
        await page.getByRole('button', { name: 'Browse gallery' }).click()
        const item = page.getByRole('button', { name: filename, exact: true })
        await item.click()
        const dialog = page.getByRole('dialog')
        await dialog.waitFor()
        await dialog.locator('img').evaluate(image => image.decode())
        const dialogBox = await dialog.boundingBox()
        assert.ok(dialogBox && dialogBox.y >= 0 && dialogBox.y + dialogBox.height <= height + 1, 'Dialog must fit the visible screen')
        await verify('gallery-dialog')
        const original = dialog.getByRole('link', { name: 'Open original' })
        assert.match(await original.getAttribute('href'), /[&]open=1$/)
        await original.scrollIntoViewIfNeeded()
        const originalBox = await original.boundingBox()
        assert.ok(originalBox && originalBox.y >= 0 && originalBox.y + originalBox.height <= height + 1)
        await page.keyboard.press('Tab')
        assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true)
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(await item.evaluate(element => document.activeElement === element), true)
        await page.unroute('**/api/**')
        await installFixtures(page, true)
        await page.goto(`${origin}/admin`)
        await page.getByRole('link', { name: 'Manage event' }).waitFor()
        await page.getByRole('button', { name: 'Create guest QR' }).click()
        await page.getByRole('link', { name: 'Download guest QR' }).waitFor()
        await verify('owner')
        await page.getByRole('button', { name: 'Revoke this link' }).click()
        await page.getByRole('link', { name: 'Download guest QR' }).waitFor({ state: 'hidden' })
        await page.getByRole('link', { name: 'Manage event' }).click()
        await page.getByRole('button', { name: 'Save event details' }).waitFor()
        await verify('dashboard')
        await page.getByRole('button', { name: filename, exact: true }).click()
        await page.getByRole('dialog').waitFor()
        await page.getByRole('dialog').locator('img').evaluate(image => image.decode())
        await verify('admin-dialog')
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        await page.getByRole('link', { name: 'Open ceremony display' }).click()
        await page.getByRole('button', { name: 'Live messages' }).click()
        await page.getByText(screen.messages[0].message_text, { exact: true }).waitFor()
        await page.getByRole('button', { name: 'Show guest QR' }).click()
        const qr = page.getByAltText('Scan to upload photos and videos')
        await qr.waitFor()
        const qrBox = await qr.boundingBox()
        assert.ok(qrBox && qrBox.y + qrBox.height <= height + 1, 'Ceremony QR must fit without scrolling')
        await verify('ceremony')
        assert.deepEqual(errors, [])
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser?.close()
    child.kill()
  }
})

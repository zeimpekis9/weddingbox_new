import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import test from 'node:test'
import { chromium, webkit } from 'playwright-core'
import sharp from 'sharp'
import { defaultTheme, presets } from '../../src/lib/theme.mjs'

const engine = process.env.WEDDING_BROWSER === 'webkit' ? webkit : chromium
const port = engine === webkit ? '34626' : '34625'
const origin = `http://127.0.0.1:${port}`
const event = '10000000-0000-0000-0000-000000000001'

async function verifyTheme(locator, config) {
  await locator.waitFor()
  const tokens = await locator.evaluate(element => {
    const style = getComputedStyle(element)
    return { canvas: style.getPropertyValue('--theme-canvas').trim(), preset: element.dataset.theme }
  })
  assert.deepEqual(tokens, { canvas: config.colors.canvas, preset: config.preset })
}

async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
}

test('all six presets preview, save, publish and render on mobile and desktop', { timeout: 120_000 }, async () => {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',port],
    { stdio: 'ignore', windowsHide: true })
  let browser
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      if ((await fetch(origin).catch(() => null))?.ok) break
      await sleep(200)
    }
    assert.ok((await fetch(origin)).ok)
    browser = await engine.launch(engine === chromium ? { channel: 'chrome', headless: true } : { headless: true })
    const output = process.env.WEDDING_SCREENSHOT_DIR
    if (output) await mkdir(output, { recursive: true })
    for (const viewport of [{ width: 320, height: 700 }, { width: 1440, height: 900 }]) {
      let draft = { config: defaultTheme, revision: 0, publishedRevision: null }
      let published = defaultTheme
      let artworkPosts = 0
      const assetId = '10000000-0000-0000-0000-000000000009'
      const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#567d54' } }).png().toBuffer()
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
      await context.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/theme/artwork')) {
          artworkPosts++
          assert.equal(route.request().method(), 'POST')
          assert.match(route.request().headers()['content-type'], /^image\/(webp|jpeg|png)$/)
          // WebKit interception can omit Blob bodies from its request metadata.
          const body = route.request().postDataBuffer()
          if (body) assert.ok(body.length > 0 && body.length <= 2 * 1024 * 1024)
          return route.fulfill({ status: 201, json: { id: assetId } })
        }
        if (path.endsWith('/theme-assets/' + assetId)) return route.fulfill({ contentType: 'image/png', body: photo })
        if (path.endsWith('/theme')) {
          if (route.request().method() === 'PUT') {
            const change = route.request().postDataJSON()
            assert.equal(change.revision, draft.revision)
            draft = { config: change.config, revision: change.revision + 1,
              publishedRevision: change.publish ? change.revision + 1 : draft.publishedRevision }
            if (change.publish) published = change.config
          }
          return route.fulfill({ json: draft })
        }
        if (path.endsWith('/access')) return route.fulfill({ json: {
          settings: { title: 'Theme test wedding', uploads_enabled: true, gallery_enabled: true,
            messages_enabled: true, voice_enabled: false, theme: published, themeRevision: draft.publishedRevision },
        } })
        if (path.endsWith('/display')) return route.fulfill({ json: {
          title: 'Theme test wedding', owner: true, photos: [], messages: [{ id: 'message', message_text: 'Congratulations!' }],
          theme: published,
        } })
        if (path.endsWith('/gallery')) return route.fulfill({ json: { media: [], next: null } })
        if (path.endsWith('/guestbook')) return route.fulfill({ json: { messages: [] } })
        return route.fulfill({ status: 404, json: {} })
      })
      const studio = await context.newPage()
      const guest = await context.newPage()
      const ceremony = await context.newPage()
      const errors = []
      for (const page of [studio, guest, ceremony]) page.on('pageerror', error => errors.push(error.message))
      await studio.goto(`${origin}/admin/local/${event}/theme`)
      await studio.getByRole('button', { name: 'Christmas Elegance' }).click()
      await studio.getByLabel('Heading font').selectOption('modern')
      await studio.getByRole('button', { name: 'Reset to preset defaults' }).click()
      assert.equal(await studio.getByLabel('Heading font').inputValue(), 'editorial')
      await studio.getByRole('button', { name: 'Save draft' }).click()
      await studio.getByText('Draft saved.', { exact: true }).waitFor()
      assert.equal(published.preset, 'minimal')
      await studio.reload()
      await verifyTheme(studio.locator('.theme-preview [data-theme="christmas"]'), presets.christmas.config)
      for (const { name, config } of Object.values(presets)) {
        const selection = studio.getByRole('button', { name, exact: true })
        await selection.focus()
        await selection.press('Space')
        assert.equal(await selection.getAttribute('aria-pressed'), 'true')
        await verifyTheme(studio.locator('.theme-preview .wedding-theme'), config)
        await noOverflow(studio)
        await studio.getByRole('button', { name: 'Publish theme' }).click()
        await studio.getByText('Theme published.', { exact: true }).waitFor()
        await guest.goto(`${origin}/join/${event}`)
        await guest.getByLabel('Επιλέξτε φωτογραφίες και βίντεο').waitFor()
        const frame = guest.locator(`.wedding-theme[data-theme="${config.preset}"]`)
        await verifyTheme(frame, config)
        if (config.decoration.motion) {
          assert.equal(await frame.locator('.theme-snow').evaluate(node => getComputedStyle(node).animationName), 'none')
        }
        await noOverflow(guest)
        if (output) await guest.screenshot({ path: join(output, `${engine.name()}-${config.preset}-${viewport.width}.png`), animations: 'disabled' })
        await ceremony.goto(`${origin}/admin/local/${event}/display`)
        await ceremony.getByRole('button', { name: 'Live messages' }).click()
        await ceremony.getByText('Congratulations!', { exact: true }).waitFor()
        await verifyTheme(ceremony.locator('.theme-stage'), config)
        await noOverflow(ceremony)
      }
      await guest.getByRole('button', { name: 'Ελληνικά / English' }).click()
      await guest.getByRole('button', { name: 'Browse gallery' }).click()
      await guest.getByText('No approved media yet.').waitFor()
      await guest.getByLabel('Guestbook message').waitFor()
      const photos = Array.from({ length: 80 }, (_, index) => ({ name: `photo-${index}.png`, mimeType: 'image/png', buffer: photo }))
      const chooser = studio.getByLabel('Collage photos')
      await chooser.setInputFiles(photos)
      const preview = studio.locator('.theme-preview .theme-backdrop')
      await preview.waitFor()
      assert.equal(await studio.locator('.theme-preview .theme-cover').count(), 0)
      const first = await preview.getAttribute('src')
      assert.match(first, /^blob:/)
      await studio.getByLabel('Collage layout').selectOption('featured')
      await studio.waitForFunction(source => {
        const current = document.querySelector('.theme-preview .theme-backdrop')?.getAttribute('src')
        return current?.startsWith('blob:') && current !== source
      }, first)
      assert.equal(artworkPosts, 0)
      await studio.getByLabel('Background texture').selectOption('collage-bold')
      await studio.getByRole('button', { name: 'Use collage in draft' }).click()
      await studio.getByRole('button', { name: 'Publish theme' }).click()
      await studio.getByText('Theme published.', { exact: true }).waitFor()
      assert.equal(artworkPosts, 1)
      assert.equal(published.cover, assetId)
      assert.equal(published.background, 'collage-bold')
      await guest.reload()
      await guest.locator('[data-background="collage-bold"] .theme-backdrop').waitFor()
      assert.equal(await guest.locator('main .theme-cover').count(), 0)
      await noOverflow(guest)
      await studio.getByLabel('Background texture').selectOption('plain')
      await studio.locator('.theme-preview .theme-cover').waitFor()
      await studio.getByRole('button', { name: 'Publish theme' }).click()
      await studio.getByText('Theme published.', { exact: true }).waitFor()
      await guest.reload()
      await guest.locator('main .theme-cover').waitFor()
      assert.equal(await guest.locator('.theme-backdrop').count(), 0)
      assert.deepEqual(errors, [])
      await context.close()
    }
  } finally {
    await browser?.close()
    child.kill()
  }
})

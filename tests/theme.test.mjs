import assert from 'node:assert/strict'
import test from 'node:test'
import { presets, themeConfig, contrast, themeTokens } from '../src/lib/theme.mjs'

test('all six presets provide accessible text, button and field colors', () => {
  assert.equal(Object.keys(presets).length, 6)
  for (const [name, preset] of Object.entries(presets)) {
    assert.deepEqual(themeConfig(preset.config), preset.config, name)
    const { ink, canvas, surface, button, buttonInk, line } = preset.config.colors
    for (const [text, background, minimum] of [
      [ink, canvas, 4.5], [ink, surface, 4.5], [buttonInk, button, 4.5], [line, surface, 3],
    ]) assert.ok(contrast(text, background) >= minimum, name)
  }
})

test('strict validation rejects low contrast, unsafe values, foreign shapes and schema versions', () => {
  const preset = presets.christmas.config
  for (const patch of [
    { version: 2 }, { font: 'url(https://example.test/font)' }, { shape: 'anything' },
    { cover: 'https://example.test' }, { decoration: { kind: 'pine', intensity: 10, motion: false } },
    { colors: { ...preset.colors, ink: preset.colors.surface } },
    { colors: { ...preset.colors, accent: 'red; color: blue' } }, { unknown: true },
  ]) assert.equal(themeConfig({ ...preset, ...patch }), null)
  assert.equal(themeTokens(preset)['--theme-canvas'], preset.colors.canvas)
})

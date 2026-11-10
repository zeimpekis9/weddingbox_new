/** @typedef {{ canvas: string, surface: string, ink: string, button: string, buttonInk: string, accent: string, line: string }} Colors */
/** @typedef {{ version: 1, preset: string, colors: Colors, font: string, shape: string, background: string,
 * decoration: { kind: string, intensity: number, motion: boolean }, cover: string|null, monogram: string|null }} ThemeConfig */

export const fonts = Object.freeze({
  classic: 'Georgia, "Times New Roman", serif',
  editorial: '"Palatino Linotype", "Book Antiqua", Georgia, serif',
  modern: 'system-ui, sans-serif',
})
export const shapes = Object.freeze({ soft: '.75rem', pill: '999px', square: '.2rem' })
export const backgrounds = ['plain', 'paper', 'gradient', 'collage-soft', 'collage-bold']
export const decorations = ['none', 'pine', 'floral', 'botanical', 'snow']

/**
 * @param {string} preset
 * @param {string} name
 * @param {Colors} colors
 * @param {Partial<ThemeConfig>} options
 */
function make(preset, name, colors, options = {}) {
  /** @type {ThemeConfig} */
  const config = { version: 1, preset, colors, font: 'classic', shape: 'soft', background: 'plain',
    decoration: { kind: 'none', intensity: 0, motion: false }, cover: null, monogram: null, ...options }
  return { name, config }
}

export const presets = Object.freeze({
  christmas: make('christmas', 'Christmas Elegance',
    { canvas: '#f6f2e7', surface: '#fffdf6', ink: '#16362c', button: '#174536', buttonInk: '#fffdf6', accent: '#b58c4e', line: '#897348' },
    { font: 'editorial', background: 'gradient', decoration: { kind: 'pine', intensity: 2, motion: true } }),
  minimal: make('minimal', 'Minimal Elegance',
    { canvas: '#f8f6f0', surface: '#fffefa', ink: '#292723', button: '#292723', buttonInk: '#fffefa', accent: '#8b7156', line: '#80766b' },
    { font: 'editorial', shape: 'square' }),
  romantic: make('romantic', 'Romantic',
    { canvas: '#f9e8ec', surface: '#fff6f8', ink: '#482537', button: '#843753', buttonInk: '#fff8fa', accent: '#aa5877', line: '#995d72' },
    { shape: 'pill', background: 'gradient', decoration: { kind: 'floral', intensity: 2, motion: false } }),
  gold: make('gold', 'Black & Gold',
    { canvas: '#161512', surface: '#242019', ink: '#f8edd6', button: '#e8c77e', buttonInk: '#241b0e', accent: '#d7ad55', line: '#9d8051' },
    { font: 'editorial', shape: 'square', background: 'paper' }),
  botanical: make('botanical', 'Rustic Botanical',
    { canvas: '#edf0e4', surface: '#fafbf4', ink: '#2a3825', button: '#3b5232', buttonInk: '#fbfcf4', accent: '#758454', line: '#6f785b' },
    { background: 'paper', decoration: { kind: 'botanical', intensity: 2, motion: false } }),
  winter: make('winter', 'Winter Wonderland',
    { canvas: '#e6eff7', surface: '#f8fcff', ink: '#203b55', button: '#355779', buttonInk: '#f8fcff', accent: '#718ca5', line: '#697e94' },
    { background: 'gradient', decoration: { kind: 'snow', intensity: 2, motion: true } }),
})

export const defaultTheme = presets.minimal.config
const hex = /^#[a-f0-9]{6}$/i
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const fields = Object.keys(defaultTheme)
const colorFields = Object.keys(defaultTheme.colors)

/** @param {string} color */
function luminance(color) {
  const channels = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

/** @param {string} left @param {string} right */
export function contrast(left, right) {
  const a = luminance(left), b = luminance(right)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** @param {unknown} value @param {string[]} keys @returns {value is Record<string, any>} */
function exact(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)))
}

/** @param {unknown} value @returns {ThemeConfig|null} */
export function themeConfig(value) {
  if (!exact(value, fields) || value.version !== 1 || typeof value.preset !== 'string' ||
      typeof value.font !== 'string' || typeof value.shape !== 'string' ||
      !Object.hasOwn(presets, value.preset) || !Object.hasOwn(fonts, value.font) || !Object.hasOwn(shapes, value.shape) ||
      !backgrounds.includes(value.background) || !exact(value.colors, colorFields) ||
      !colorFields.every(key => typeof value.colors[key] === 'string' && hex.test(value.colors[key])) ||
      !exact(value.decoration, ['kind', 'intensity', 'motion']) ||
      !decorations.includes(value.decoration.kind) || ![0, 1, 2, 3].includes(value.decoration.intensity) ||
      typeof value.decoration.motion !== 'boolean' ||
      ![value.cover, value.monogram].every(id => id === null || (typeof id === 'string' && uuid.test(id)))) return null
  const { ink, canvas, surface, button, buttonInk, line } = value.colors
  if (contrast(ink, canvas) < 4.5 || contrast(ink, surface) < 4.5 || contrast(buttonInk, button) < 4.5 ||
      contrast(line, surface) < 3 || contrast(line, canvas) < 3 ||
      (luminance(ink) > luminance(canvas)) !== (luminance(ink) > luminance(surface))) return null
  return /** @type {ThemeConfig} */ ({
    ...value, cover: value.cover?.toLowerCase() ?? null, monogram: value.monogram?.toLowerCase() ?? null,
  })
}

/** @param {ThemeConfig} config */
export function themeTokens(config) {
  return {
    '--theme-canvas': config.colors.canvas, '--theme-surface': config.colors.surface, '--theme-ink': config.colors.ink,
    '--theme-button': config.colors.button, '--theme-button-ink': config.colors.buttonInk,
    '--theme-accent': config.colors.accent, '--theme-line': config.colors.line,
    '--theme-heading': fonts[/** @type {keyof fonts} */ (config.font)],
    '--theme-radius': shapes[/** @type {keyof shapes} */ (config.shape)],
    '--theme-intensity': config.decoration.intensity / 3,
  }
}

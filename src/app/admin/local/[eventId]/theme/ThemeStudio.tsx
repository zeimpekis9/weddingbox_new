'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { backdropUrl, ThemeArtwork, WeddingTheme } from '@/components/WeddingTheme'
import { backgrounds, decorations, fonts, presets, shapes, themeConfig, type ThemeConfig } from '@/lib/theme.mjs'
import CollageBuilder from './CollageBuilder'

const colors = {
  canvas: 'Page background', surface: 'Card background', ink: 'Text',
  button: 'Primary button', buttonInk: 'Button text', accent: 'Decoration', line: 'Borders',
}
type Snapshot = { config: ThemeConfig; revision: number; publishedRevision: number | null }
const inputClass = 'input-field block w-full'

export default function ThemeStudio({ eventId }: { eventId: string }) {
  const [saved, setSaved] = useState<Snapshot | null>(null)
  const [draft, setDraft] = useState<ThemeConfig | null>(null)
  const [notice, setNotice] = useState('Loading theme studio…')
  const [busy, setBusy] = useState(false)
  const [collagePreview, setCollagePreview] = useState<string | null>(null)
  const base = `/api/admin/events/${eventId}/theme`

  useEffect(() => {
    const controller = new AbortController()
    fetch(base, { signal: controller.signal }).then(async response => {
      if (response.status === 404) {
        setNotice('Sign in as an owner of this event to use the theme studio.')
        return
      }
      if (!response.ok) throw new Error()
      const snapshot: Snapshot = await response.json()
      const config = themeConfig(snapshot.config)
      if (!config) throw new Error()
      if (controller.signal.aborted) return
      setSaved(snapshot)
      setDraft(config)
      setNotice('')
    }).catch(() => {
      if (!controller.signal.aborted) setNotice('Could not load the theme studio. Reload to try again.')
    })
    return () => controller.abort()
  }, [base])

  async function save(publish: boolean) {
    if (!draft || !saved || !themeConfig(draft)) return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch(base, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: draft, revision: saved.revision, publish }),
      })
      if (response.status === 409) {
        setNotice('The theme changed elsewhere or an image is unavailable. Reload before trying again.')
        return
      }
      if (!response.ok) throw new Error()
      const snapshot: Snapshot = await response.json()
      setSaved(snapshot)
      setNotice(publish ? 'Theme published.' : 'Draft saved.')
    } catch {
      setNotice('Could not save the theme. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function upload(kind: 'cover' | 'monogram', file?: File, collage = false) {
    if (!file) return false
    if (file.size > 2 * 1024 * 1024) {
      setNotice('Artwork must be at most 2 MiB.')
      return false
    }
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch(`${base}/artwork?kind=${kind}`, {
        method: 'POST', body: file, headers: { 'Content-Type': file.type },
      })
      if (!response.ok) {
        const result = await response.json()
        setNotice(result.error ?? 'Could not upload artwork.')
        return false
      }
      const { id } = await response.json()
      setDraft(current => current && ({ ...current, [kind]: id,
        background: collage && !current.background.startsWith('collage-') ? 'collage-soft' : current.background }))
      setNotice('Artwork added to this preview. Save or publish to keep the change.')
      return true
    } catch {
      setNotice('Could not upload artwork. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const valid = Boolean(themeConfig(draft))
  const previewTheme = draft && collagePreview && !draft.background.startsWith('collage-')
    ? { ...draft, background: 'collage-soft' } : draft
  const previewBackdrop = collagePreview ?? (draft ? backdropUrl(draft, eventId) : undefined)
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <nav className="flex flex-wrap gap-4" aria-label="Theme studio navigation">
      <Link className="underline" prefetch={false} href={`/admin/local/${eventId}`}>Event dashboard</Link>
      <Link className="underline" prefetch={false} href="/admin">Owner sign-in</Link>
    </nav>
    <header className="space-y-2">
      <h1 className="text-3xl sm:text-4xl">Theme studio</h1>
      <p>Shape your wedding’s look and preview changes before sharing them with guests.</p>
      {saved && <p className="text-sm">Draft revision {saved.revision} · {saved.publishedRevision ? `Published revision ${saved.publishedRevision}` : 'Default theme is live'}</p>}
    </header>
    <p role="status" className="min-h-6">{notice}</p>
    {draft && <div className="grid items-start gap-5 lg:grid-cols-2">
      <fieldset className="min-w-0 space-y-5" disabled={busy} aria-label="Theme controls">
        <section className="card space-y-3" aria-labelledby="theme-presets">
          <h2 id="theme-presets" className="text-xl">Presets</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.values(presets).map(({ name, config }) => <button key={config.preset} type="button"
              aria-pressed={draft.preset === config.preset}
              className="min-w-0 rounded-lg border px-2 py-2 text-sm aria-pressed:ring-2"
              style={{ backgroundColor: config.colors.canvas, color: config.colors.ink, borderColor: config.colors.line }}
              onClick={() => setDraft(config)}>
              <span aria-hidden="true" className="mx-auto mb-1 block h-1 w-8 rounded" style={{ backgroundColor: config.colors.button }} />
              {name}
            </button>)}
          </div>
          <button className="btn-secondary" type="button"
            onClick={() => setDraft(presets[draft.preset as keyof typeof presets].config)}>Reset to preset defaults</button>
        </section>
        <section className="card space-y-4" aria-labelledby="theme-style">
          <h2 id="theme-style" className="text-xl">Style</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(colors).map(([key, label]) => {
              const color = key as keyof ThemeConfig['colors']
              return <label key={key} className="flex min-w-0 flex-col gap-1">{label}
                <input type="color" className="h-11 w-full cursor-pointer rounded border"
                  value={draft.colors[color]} onChange={event => setDraft({ ...draft, colors: { ...draft.colors, [color]: event.target.value } })} />
              </label>
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ['font', 'Heading font', Object.keys(fonts)],
              ['shape', 'Button shape', Object.keys(shapes)],
              ['background', 'Background texture', backgrounds],
            ] as const).map(([key, label, values]) => <label key={key}>{label}
              <select className={inputClass} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })}>
                {values.map(value => <option key={value} value={value}>{value === 'collage-soft' ? 'Collage · soft' :
                  value === 'collage-bold' ? 'Collage · bold' : value}</option>)}
              </select>
            </label>)}
            <label>Decorations
              <select className={inputClass} value={draft.decoration.kind}
                onChange={event => setDraft({ ...draft, decoration: { ...draft.decoration, kind: event.target.value } })}>
                {decorations.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Decorative intensity
              <select className={inputClass} value={draft.decoration.intensity}
                onChange={event => setDraft({ ...draft, decoration: { ...draft.decoration, intensity: Number(event.target.value) } })}>
                {['Off', 'Subtle', 'Balanced', 'Full'].map((value, index) => <option key={value} value={index}>{value}</option>)}
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.decoration.motion}
              onChange={event => setDraft({ ...draft, decoration: { ...draft.decoration, motion: event.target.checked } })} />
              Animate snowfall on pine or snow themes
            </label>
          </div>
        </section>
        <section className="card space-y-4" aria-labelledby="theme-artwork">
          <h2 id="theme-artwork" className="text-xl">Artwork</h2>
          <p>JPEG, PNG or WebP. Up to 2 MiB per image.</p>
          {(['cover', 'monogram'] as const).map(kind => <div key={kind} className="flex flex-wrap items-end gap-2">
            <label className="min-w-0">{kind === 'cover' ? 'Cover image' : 'Monogram'}
              <input className={inputClass} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
                void upload(kind, event.target.files?.[0])
                event.target.value = ''
              }} />
            </label>
            {draft[kind] && <button className="btn-secondary" type="button" onClick={() => setDraft({ ...draft, [kind]: null })}>Remove {kind}</button>}
          </div>)}
        </section>
        <CollageBuilder onPreview={setCollagePreview} onUse={file => upload('cover', file, true)} />
        {!valid && <p role="alert">Increase contrast between text, buttons, borders and their backgrounds before saving.</p>}
        {collagePreview && <p>Use or clear the collage preview before saving the theme.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!valid || Boolean(collagePreview)} className="btn-secondary" onClick={() => void save(false)}>Save draft</button>
          <button type="button" disabled={!valid || Boolean(collagePreview)} className="btn-primary" onClick={() => void save(true)}>Publish theme</button>
        </div>
      </fieldset>
      <section id="guest-theme-preview" className="theme-preview space-y-2 lg:sticky lg:top-4" aria-label="Live theme preview">
        <h2 className="text-xl">Guest preview</h2>
        <WeddingTheme theme={previewTheme ?? draft} backdrop={previewBackdrop}>
          <div className="space-y-4 rounded-lg border p-4 sm:p-6" aria-hidden="true">
            <div className="theme-name flex items-center gap-2 border-s-4 ps-3">
              <ThemeArtwork eventId={eventId} id={draft.monogram} kind="monogram" />
              <span className="theme-heading">Your wedding</span>
            </div>
            <h3 className="text-3xl">Share your memories</h3>
            <div className="btn-primary text-center">Choose photos and videos</div>
            {!previewBackdrop && <ThemeArtwork eventId={eventId} id={draft.cover} kind="cover" />}
            <div className="card">Guestbook and gallery</div>
          </div>
        </WeddingTheme>
      </section>
    </div>}
  </main>
}

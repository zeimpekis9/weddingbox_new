'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import Exports from './Exports'
import MediaDialog from '@/components/MediaDialog'

type Item = { id: string; moderation: string; filename?: string; message_text?: string; content_type?: string }
type Settings = { gallery_enabled: boolean; uploads_enabled: boolean; messages_enabled: boolean; voice_enabled: boolean }
type Dashboard = {
  event: { title: string; role: string }; settings: Settings & { welcome_message?: string }
  profile: { slug: string; event_date: string | null; primary_color: string | null }
  stats: { photos: number; videos: number; pending: number; bytes: string }
  operations: { pending_uploads: number; failed_uploads: number; queued_jobs: number; failed_jobs: number
    database_ready: boolean; storage_configured: boolean; upload_only: boolean }
  media: Item[]; messages: Item[]; logs: { operation: string; created_at: string }[]
}
const options = {
  gallery_enabled: 'Guest gallery', uploads_enabled: 'Photo and video uploads',
  messages_enabled: 'Written guestbook', voice_enabled: 'Voice guestbook',
}

async function loadDashboard(path: string, signal?: AbortSignal): Promise<Dashboard> {
  const response = await fetch(path, { signal })
  if (!response.ok) throw new Error('Event unavailable.')
  return response.json()
}

export default function EventDashboard({ eventId }: { eventId: string }) {
  const path = `/api/admin/events/${eventId}/manage`
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<{ item: Item; url: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    loadDashboard(path, controller.signal).then(setDashboard).catch(() => {
      if (!controller.signal.aborted) setError('Event unavailable.')
    })
    return () => controller.abort()
  }, [path])

  async function update(body: object) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body) })
      if (!response.ok) throw new Error((await response.json()).error)
      setDashboard(await loadDashboard(path))
      setNotice('Change saved.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Change could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function show(item: Item) {
    try {
      const response = await fetch(`${path}?media=${item.id}`)
      if (!response.ok) throw new Error()
      setPreview({ item, url: (await response.json()).url })
    } catch {
      setError('Media unavailable.')
    }
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    void update({ kind: 'settings', ...Object.fromEntries(Object.keys(options).map(key => [key, form.has(key)])) })
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void update({ kind: 'profile', ...Object.fromEntries(new FormData(event.currentTarget)) })
  }

  function items(kind: 'media' | 'message', records: Item[]) {
    if (!records.length) return <p className="text-sm">No {kind === 'media' ? 'media uploads' : 'messages'} yet.</p>
    return <ul className="space-y-2">{records.map(item => (
      <li key={item.id} className="card grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        {kind === 'media' ? <button className="min-w-0 text-left underline" onClick={event => {
          event.currentTarget.focus({ preventScroll: true })
          void show(item)
        }}>
          {item.filename}
        </button> : <p className="break-words">{item.message_text}</p>}
        <select className="input-field w-full sm:w-auto" aria-label="Moderation status" value={item.moderation} disabled={saving}
          onChange={event => void update({ kind, id: item.id, state: event.target.value })}>
          {['pending', 'approved', 'rejected', 'hidden'].map(state => <option key={state}>{state}</option>)}
        </select>
      </li>
    ))}</ul>
  }

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-5 py-10">
      <Link href="/admin" prefetch={false} className="btn-secondary inline-flex items-center">All events</Link>
      <h1 className="text-3xl">{dashboard?.event.title ?? 'Event management'}</h1>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!dashboard && !error && <p role="status">Loading event…</p>}
      {dashboard && <>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/local/${eventId}/display`} prefetch={false} className="btn-secondary inline-flex items-center">Open ceremony display</Link>
          {dashboard.event.role === 'owner' && <Link href={`/admin/local/${eventId}/theme`} prefetch={false}
            className="btn-secondary inline-flex items-center">Theme studio</Link>}
        </div>
        <p>{dashboard.stats.photos} photos · {dashboard.stats.videos} videos · {dashboard.stats.pending} pending · {dashboard.stats.bytes} bytes</p>
        <section className="card space-y-2" aria-label="Operational status">
          <h2 className="text-xl">Operational status</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div><dt>Database</dt><dd>{dashboard.operations.database_ready ? 'Connected' : 'Unavailable'}</dd></div>
            <div><dt>Storage configuration</dt><dd>{dashboard.operations.storage_configured ? 'Present' : 'Missing'}</dd></div>
            <div><dt>Event mode</dt><dd>{dashboard.operations.upload_only ? 'Uploads only' : 'Standard'}</dd></div>
            <div><dt>Pending uploads</dt><dd>{dashboard.operations.pending_uploads}</dd></div>
            <div><dt>Failed uploads</dt><dd>{dashboard.operations.failed_uploads}</dd></div>
            <div><dt>Active / failed jobs</dt><dd>{dashboard.operations.queued_jobs} / {dashboard.operations.failed_jobs}</dd></div>
          </dl>
        </section>
        {dashboard.event.role === 'owner' && <form className="card space-y-3" onSubmit={saveProfile}>
          <h2 className="text-xl">Event details</h2>
          <label className="block">Title <input className="input-field block w-full" name="title" required maxLength={120}
            defaultValue={dashboard.event.title} /></label>
          <label className="block">Event address <input className="input-field block w-full" name="slug" required maxLength={80}
            pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={dashboard.profile.slug} /></label>
          <label className="block">Event date <input className="input-field block w-full" type="date" name="date" defaultValue={dashboard.profile.event_date ?? ''} /></label>
          <label className="block">Welcome message <textarea className="input-field block w-full" name="welcome"
            maxLength={1000} defaultValue={dashboard.settings.welcome_message ?? ''} /></label>
          <label className="flex min-h-11 items-center gap-3">Accent color <input className="h-11 w-16" type="color" name="color" defaultValue={dashboard.profile.primary_color ?? '#a67c52'} /></label>
          <button className="btn-primary" disabled={saving}>Save event details</button>
        </form>}
        {dashboard.event.role === 'owner' && <form className="card space-y-2" onSubmit={saveSettings}>
          <h2 className="text-xl">Guest permissions</h2>
          {Object.entries(options).map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name={key} defaultChecked={dashboard.settings[key as keyof Settings]} /> {label}
          </label>)}
          <button className="btn-primary" disabled={saving}>Save guest permissions</button>
        </form>}
        <h2 className="text-xl">Recent media and voice messages</h2>
        {items('media', dashboard.media)}
        <h2 className="text-xl">Guestbook messages</h2>
        {items('message', dashboard.messages)}
        {dashboard.logs.length > 0 && <section>
          <h2 className="text-xl">Recent moderation and settings changes</h2>
          <ul>{dashboard.logs.map((log, index) => <li key={index}>{log.operation} · {new Date(log.created_at).toLocaleString()}</li>)}</ul>
        </section>}
        {dashboard.event.role === 'owner' && <Exports eventId={eventId} paused={dashboard.operations.upload_only} />}
      </>}
      {preview && <MediaDialog key={preview.item.id} url={preview.url} type={preview.item.content_type} title={preview.item.filename}
        originalHref={`${path}?media=${preview.item.id}&open=1`}
        closeLabel="Close" originalLabel="Open original" errorLabel="Preview unavailable." onDismiss={() => setPreview(null)} />}
    </main>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'

type Event = { id: string; slug: string; title: string; role: 'owner' | 'moderator' }

async function loadEvents(signal?: AbortSignal): Promise<Event[] | null> {
  const response = await fetch('/api/admin/events', { signal })
  if (response.status === 401) return null
  if (!response.ok) throw new Error('Event access is unavailable.')
  return (await response.json()).events
}

export default function LocalAdminPage() {
  const [events, setEvents] = useState<Event[] | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [share, setShare] = useState<{ url: string; qr: string; eventId: string; linkId: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    loadEvents(controller.signal).then(setEvents).catch(() => {
      if (!controller.signal.aborted) setError('Event access is unavailable.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(form)),
      })
      if (!response.ok) throw new Error((await response.json()).error)
      setEvents(await loadEvents())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign-in unavailable.')
    } finally {
      setPending(false)
    }
  }

  async function logout() {
    setPending(true)
    try {
      const response = await fetch('/api/admin/session', { method: 'DELETE' })
      if (!response.ok) throw new Error('Sign-out unavailable.')
      setShare(null)
      setEvents(null)
    } catch {
      setError('Sign-out unavailable.')
    } finally {
      setPending(false)
    }
  }

  async function createLink(eventId: string) {
    setPending(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/events/${eventId}/guest-links`, { method: 'POST' })
      if (!response.ok) throw new Error('Could not create a guest link.')
      const { token, id } = await response.json()
      const url = new URL(`/join/${eventId}`, window.location.origin)
      url.hash = token
      const { toDataURL } = await import('qrcode')
      const qr = await toDataURL(url.href, { errorCorrectionLevel: 'M', width: 800 })
      setShare({ url: url.href, qr, eventId, linkId: id })
    } catch {
      setError('Could not create a guest link.')
    } finally {
      setPending(false)
    }
  }

  async function revokeLink() {
    if (!share) return
    setPending(true)
    try {
      const response = await fetch(`/api/admin/events/${share.eventId}/guest-links`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: share.linkId }),
      })
      if (!response.ok) throw new Error('Guest link could not be revoked.')
      setShare(null)
    } catch {
      setError('Guest link could not be revoked.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/" className="btn-secondary inline-flex items-center">Home</Link>
      <h1 className="text-3xl sm:text-4xl">Wedding administration</h1>
      {error && <p role="alert">{error}</p>}
      {loading ? <p role="status">Checking session…</p> : events ? (
        <>
          <ul className="space-y-2">
            {events.map(event => (
              <li key={event.id} className="card space-y-3">
                <h2 className="text-xl">{event.title}</h2>
                <p className="text-sm capitalize">{event.role}</p>
                <div className="flex flex-wrap gap-2">
                  <Link className="btn-secondary inline-flex items-center" href={`/admin/local/${event.id}`}>Manage event</Link>
                  {event.role === 'owner' && <button type="button" className="btn-secondary" disabled={pending}
                    onClick={() => void createLink(event.id)}>Create guest QR</button>}
                </div>
              </li>
            ))}
          </ul>
          {share && (
            <section className="card space-y-3" aria-label="Guest QR">
              <img src={share.qr} className="mx-auto w-40" alt="Scan to open the guest upload page" />
              <input aria-label="Guest link" className="input-field w-full" readOnly value={share.url}
                onFocus={event => event.target.select()} />
              <div className="flex flex-wrap gap-2">
                <a className="btn-secondary inline-flex items-center" href={share.qr} download="wedding-guest-qr.png">Download guest QR</a>
                <button className="btn-secondary" type="button" disabled={pending} onClick={() => void revokeLink()}>Revoke this link</button>
              </div>
            </section>
          )}
          <button className="btn-primary" disabled={pending} onClick={logout}>Sign out</button>
        </>
      ) : (
        <form onSubmit={login} className="card space-y-4" aria-busy={pending}>
          <label className="block">Email <input className="input-field block w-full" name="email" type="email" autoComplete="username" maxLength={254} required /></label>
          <label className="block">Password <input className="input-field block w-full" name="password" type="password" autoComplete="current-password" maxLength={256} required /></label>
          <label className="block">Authenticator code <input className="input-field block w-full" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
          <button className="btn-primary w-full sm:w-auto" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
        </form>
      )}
    </main>
  )
}

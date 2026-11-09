'use client'

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

  useEffect(() => {
    const controller = new AbortController()
    loadEvents(controller.signal).then(setEvents).catch(() => {
      if (!controller.signal.aborted) setError('Event access is unavailable.')
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
      setEvents(null)
    } catch {
      setError('Sign-out unavailable.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-5 py-12">
      <h1 className="text-3xl">Wedding administration</h1>
      {error && <p role="alert">{error}</p>}
      {events ? (
        <>
          <ul className="space-y-2">
            {events.map(event => <li key={event.id}>{event.title} · {event.role}</li>)}
          </ul>
          <button className="btn-primary" disabled={pending} onClick={logout}>Sign out</button>
        </>
      ) : (
        <form onSubmit={login} className="space-y-4">
          <label className="block">Email <input className="input-field w-full" name="email" type="email" autoComplete="username" required /></label>
          <label className="block">Password <input className="input-field w-full" name="password" type="password" autoComplete="current-password" required /></label>
          <label className="block">Authenticator code <input className="input-field w-full" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
          <button className="btn-primary" disabled={pending}>Sign in</button>
        </form>
      )}
    </main>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'

type Photo = { id: string; url: string }
type Feed = { title: string; owner: boolean; photos: Photo[]; messages: { id: string; message_text: string }[] }
const empty: Feed = { title: '', owner: false, photos: [], messages: [] }

export default function Ceremony({ eventId }: { eventId: string }) {
  const [feed, setFeed] = useState(empty)
  const [mode, setMode] = useState<'photos' | 'messages'>('photos')
  const [position, setPosition] = useState(0)
  const [paused, setPaused] = useState(false)
  const [duration, setDuration] = useState(6)
  const [qr, setQr] = useState('')
  const [notice, setNotice] = useState('Loading approved content…')
  const [presentation, setPresentation] = useState(false)
  const stage = useRef<HTMLElement>(null)
  const frames = mode === 'photos' ? feed.photos : feed.messages
  const count = frames.length
  const index = count ? ((position % count) + count) % count : 0

  useEffect(() => {
    const controller = new AbortController()
    const cache = new Map<string, string>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastSuccess = 0
    function clearCache() {
      cache.forEach(url => URL.revokeObjectURL(url))
      cache.clear()
    }
    async function refresh() {
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])
        const response = await fetch(`/api/admin/events/${eventId}/display`, { signal })
        if ([401,403,404].includes(response.status)) {
          clearCache()
          setFeed(empty)
          setNotice('Sign in to display this event.')
          return
        }
        if (!response.ok) throw new Error()
        const latest: Feed = await response.json()
        const approved = new Set(latest.photos.map(photo => photo.id))
        cache.forEach((url, id) => {
          if (!approved.has(id)) {
            URL.revokeObjectURL(url)
            cache.delete(id)
          }
        })
        setFeed({ ...latest, photos: latest.photos.map(photo => ({ ...photo, url: cache.get(photo.id) ?? photo.url })) })
        lastSuccess = Date.now()
        setNotice('')
        const next = [...latest.photos]
        await Promise.all(Array.from({ length: 2 }, async () => {
          for (let photo = next.shift(); photo; photo = next.shift()) {
            if (cache.has(photo.id) || controller.signal.aborted) continue
            try {
              const asset = await fetch(photo.url, { signal, credentials: 'omit' })
              const size = Number(asset.headers.get('content-length'))
              if (!asset.ok || !size || size > 4 * 1024 * 1024) {
                await asset.body?.cancel()
                continue
              }
              const blob = await asset.blob()
              if (blob.size <= 4 * 1024 * 1024 && !controller.signal.aborted) {
                cache.set(photo.id, URL.createObjectURL(blob))
              }
            } catch {
              // The signed image URL remains usable online.
            }
          }
        }))
        if (!controller.signal.aborted) {
          setFeed({ ...latest, photos: latest.photos.map(photo => ({ ...photo, url: cache.get(photo.id) ?? photo.url })) })
        }
      } catch {
        if (controller.signal.aborted) return
        setNotice('Reconnecting…')
        if (Date.now() - lastSuccess > 10 * 60 * 1000) {
          clearCache()
          setFeed(empty)
        } else {
          setFeed(current => ({ ...current, photos: current.photos.filter(photo => cache.has(photo.id)) }))
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 4500 + Math.random() * 1000)
      }
    }
    void refresh()
    return () => {
      controller.abort()
      clearTimeout(timer)
      clearCache()
    }
  }, [eventId])

  useEffect(() => {
    if (paused || count < 2) return
    const timer = setInterval(() => setPosition(value => value + 1), duration * 1000)
    return () => clearInterval(timer)
  }, [paused, count, duration])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresentation(false)
      if (event.target instanceof HTMLElement && event.target.closest('button,select,input,p[tabindex]')) return
      if (event.key === 'ArrowRight') setPosition(value => value + 1)
      if (event.key === 'ArrowLeft') setPosition(value => value - 1)
      if (event.code === 'Space') {
        event.preventDefault()
        setPaused(value => !value)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  async function showQr() {
    if (qr) return setQr('')
    const response = await fetch(`/api/admin/events/${eventId}/guest-links`, { method: 'POST' })
    if (!response.ok) throw new Error()
    const { token } = await response.json()
    const url = new URL(`/join/${eventId}`, window.location.origin)
    url.hash = token
    const { toDataURL } = await import('qrcode')
    setQr(await toDataURL(url.href, { width: 400 }))
  }

  async function fullscreen() {
    if (presentation) {
      setPresentation(false)
      return
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (stage.current?.requestFullscreen) await stage.current.requestFullscreen()
      else setPresentation(true)
    } catch {
      setPresentation(true)
    }
  }

  return (
    <main ref={stage} className={`ceremony-screen flex h-[100dvh] min-h-72 flex-col gap-2 overflow-y-auto bg-black text-white ${presentation ? 'fixed inset-0 z-50' : 'relative'}`}>
      <nav className="z-10 flex shrink-0 flex-wrap items-center gap-x-4 rounded bg-black/70 px-2 text-sm" aria-label="Ceremony controls">
        <button aria-pressed={mode === 'photos'} className="aria-pressed:underline" onClick={() => { setMode('photos'); setPosition(0) }}>Slideshow</button>
        <button aria-pressed={mode === 'messages'} className="aria-pressed:underline" onClick={() => { setMode('messages'); setPosition(0) }}>Live messages</button>
        <button onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</button>
        <label>Seconds <select className="bg-black" value={duration} onChange={event => setDuration(Number(event.target.value))}>
          {[4,6,10,15].map(value => <option key={value}>{value}</option>)}
        </select></label>
        <button onClick={() => void fullscreen()}>{presentation ? 'Exit presentation' : 'Fullscreen'}</button>
        {feed.owner && <button onClick={() => void showQr().catch(() => setNotice('QR unavailable.'))}>
          {qr ? 'Hide guest QR' : 'Show guest QR'}
        </button>}
      </nav>
      <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden text-center">
        {mode === 'photos' && feed.photos.map((photo, item) => (
          <img key={photo.id} src={photo.url} alt="" aria-hidden={index !== item}
            className={`absolute h-full w-full object-contain transition-opacity duration-700 motion-reduce:transition-none ${index === item ? 'opacity-100' : 'opacity-0'}`} />
        ))}
        {mode === 'messages' && feed.messages[index] && <p tabIndex={0}
          className="max-h-full max-w-5xl overflow-auto px-2 text-[clamp(1.125rem,4.5vw,3.75rem)]">{feed.messages[index].message_text}</p>}
        {!count && !notice && <p>No approved {mode} yet.</p>}
      </div>
      <footer className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h1 className="min-w-0">{feed.title || 'Ceremony display'}</h1>
        {notice && <p role="status">{notice}</p>}
        {qr && feed.owner && <img className="w-24 sm:w-32 md:w-44" src={qr} alt="Scan to upload photos and videos" />}
      </footer>
    </main>
  )
}

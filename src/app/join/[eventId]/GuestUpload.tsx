'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { cancelTransfer, fingerprint, transfer, uploadType } from '@/lib/client/upload'
const GuestContent = dynamic(() => import('./GuestContent'))

const words = {
  el: {
    title: 'Μοιραστείτε τις αναμνήσεις σας', choose: 'Επιλέξτε φωτογραφίες και βίντεο',
    ready: 'Μπορείτε να επιλέξετε πολλά αρχεία μαζί.', retry: 'Δοκιμάστε ξανά', cancel: 'Ακύρωση',
    loading: 'Έλεγχος συνδέσμου…', denied: 'Ο σύνδεσμος δεν είναι διαθέσιμος. Σαρώστε ξανά τον κωδικό QR.',
    queued: 'Σε αναμονή', sending: 'Αποστολή', done: 'Παραλήφθηκε', failed: 'Η αποστολή διακόπηκε',
    cancelled: 'Η αποστολή σταμάτησε', privacy: 'Οι διοργανωτές μπορούν να δουν τα αρχεία που στέλνετε.',
    connection: 'Η σύνδεση διακόπηκε. Δοκιμάστε ξανά.', disabled: 'Οι αποστολές φωτογραφιών και βίντεο είναι κλειστές.',
    resume: 'Για συνέχιση μετά την επαναφόρτωση, επιλέξτε ξανά τα ίδια αρχεία.',
  },
  en: {
    title: 'Share your memories', choose: 'Choose photos and videos',
    ready: 'Select several files at once.', retry: 'Retry', cancel: 'Cancel',
    loading: 'Checking your link…', denied: 'This link is unavailable. Scan the QR code again.',
    queued: 'Waiting', sending: 'Uploading', done: 'Received', failed: 'Upload interrupted',
    cancelled: 'Upload stopped', privacy: 'The event organizers can see the files you send.',
    connection: 'Could not connect. Try again.', disabled: 'Photo and video uploads are closed.',
    resume: 'To resume after reloading, select the same files again.',
  },
}
type Job = { key: string; file: File; state: 'queued' | 'sending' | 'done' | 'failed' | 'cancelled'; progress: number }
type StoredUpload = { requestId: string; session?: string }
type Settings = {
  title?: string; welcome_message?: string; event_date?: string; primary_color?: string; gallery_enabled: boolean
  uploads_enabled: boolean; messages_enabled: boolean; voice_enabled: boolean
}

function readUpload(key: string): StoredUpload | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    return value && typeof value.requestId === 'string' ? value : null
  } catch {
    return null
  }
}

function saveUpload(key: string, upload: StoredUpload | null) {
  try {
    if (upload) localStorage.setItem(key, JSON.stringify(upload))
    else localStorage.removeItem(key)
  } catch {
    // Private browsing may disable persistence.
  }
}

export default function GuestUpload({ eventId }: { eventId: string }) {
  const [language, setLanguage] = useState<'el' | 'en'>('el')
  const [access, setAccess] = useState<'loading' | 'ready' | 'denied' | 'connection'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [jobs, setJobs] = useState<Job[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [working, setWorking] = useState(false)
  const busy = useRef(false)
  const controllers = useRef(new Map<string, AbortController>())
  const queued = useRef<Job[]>([])
  const text = words[language]

  useEffect(() => {
    const controller = new AbortController()
    const link = window.location.hash.slice(1)
    fetch(`/api/events/${eventId}/access`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link }), signal: controller.signal,
    }).then(async response => {
      if (!response.ok) return setAccess(response.status === 403 ? 'denied' : 'connection')
      const data = await response.json()
      if (controller.signal.aborted) return
      if (link) window.history.replaceState(null, '', window.location.pathname)
      setSettings(data.settings ?? null)
      setAccess('ready')
    }).catch(() => {
      if (!controller.signal.aborted) setAccess('connection')
    })
    return () => controller.abort()
  }, [eventId, attempt])

  async function processJob(job: Job) {
    const controller = controllers.current.get(job.key)
    if (!controller || controller.signal.aborted) return
    let storageKey: string | undefined
    let upload: StoredUpload | null = null
    const update = (state: Partial<Job>) => setJobs(current =>
      current.map(item => item.key === job.key ? { ...item, ...state } : item))
    update({ state: 'sending', progress: 0 })
    try {
      const hash = await fingerprint(job.file, controller.signal)
      storageKey = `wedding-upload:${eventId}:${hash}:${encodeURIComponent(job.file.name)}:${uploadType(job.file)}`
      upload = readUpload(storageKey) ?? { requestId: crypto.randomUUID() }
      saveUpload(storageKey, upload)
      await transfer(eventId, job.file, upload.requestId, controller.signal,
        loaded => update({ progress: Math.min(99, Math.floor(100 * loaded / job.file.size)) }),
        id => {
          if (!upload || !storageKey) return
          upload.session = id
          saveUpload(storageKey, upload)
        })
      update({ state: 'done', progress: 100 })
    } catch {
      if (controller.signal.aborted && upload?.session) {
        try {
          await cancelTransfer(eventId, upload.session)
          if (storageKey) saveUpload(storageKey, null)
        } catch {
          // Preserve the request ID so the next attempt can recover its status.
        }
      }
      update({ state: controller.signal.aborted ? 'cancelled' : 'failed' })
    } finally {
      controllers.current.delete(job.key)
    }
  }

  async function run(batch: Job[]) {
    if (!batch.length) return
    if (busy.current) {
      queued.current.push(...batch)
      return
    }
    busy.current = true
    setWorking(true)
    for (const job of batch) controllers.current.set(job.key, new AbortController())
    let next = 0
    try {
      await Promise.all(Array.from({ length: Math.min(2, batch.length) }, async () => {
        while (next < batch.length) await processJob(batch[next++])
      }))
    } finally {
      busy.current = false
      const nextBatch = queued.current.splice(0)
      if (nextBatch.length) void run(nextBatch)
      else setWorking(false)
    }
  }

  function add(files: ArrayLike<File> | null) {
    if (!files) return
    const batch = Array.from(files).slice(0, 100).map(file =>
      ({ key: crypto.randomUUID(), file, state: 'queued' as const, progress: 0 }))
    setJobs(current => [...current.filter(job => job.state !== 'done'), ...batch])
    void run(batch)
  }

  return (
    <main lang={language} className="mx-auto max-w-2xl space-y-4 px-4 py-3 sm:px-6 sm:py-8">
      <div className="flex justify-end">
        <button type="button" aria-label="Ελληνικά / English" className="px-2 underline"
          onClick={() => setLanguage(language === 'el' ? 'en' : 'el')}>{language === 'el' ? 'English' : 'Ελληνικά'}</button>
      </div>
      <h1 className="text-3xl leading-tight sm:text-4xl">{text.title}</h1>
      {settings?.title && <p className="border-s-4 ps-3 font-display text-xl"
        style={{ borderColor: settings.primary_color }}>{settings.title}</p>}
      {settings?.event_date && <time dateTime={settings.event_date}>{settings.event_date}</time>}
      {access !== 'ready' ? <div className="card space-y-2">
        <p role="status">{text[access]}</p>
        {access === 'connection' && <button className="btn-secondary" onClick={() => {
          setAccess('loading')
          setAttempt(value => value + 1)
        }}>{text.retry}</button>}
      </div> : (
        <>
          {settings?.uploads_enabled !== false && <label className="btn-primary block cursor-pointer text-center focus-within:outline">
            {text.choose}
            <input type="file" className="sr-only" multiple accept="image/*,video/*"
              disabled={working} onChange={event => {
                add(event.target.files)
                event.target.value = ''
              }} />
          </label>}
          <p className="text-sm">{settings?.uploads_enabled === false ? text.disabled : `${text.ready} ${text.privacy}`}</p>
          {settings?.welcome_message && <p>{settings.welcome_message}</p>}
          {settings?.uploads_enabled !== false && <p className="text-sm">{text.resume}</p>}
          {jobs.length > 0 && <p role="status">{text.done} {jobs.filter(job => job.state === 'done').length} / {jobs.length}</p>}
          <ul className="space-y-3">
            {jobs.map(job => (
              <li key={job.key} className="card space-y-1">
                <p className="break-all">{job.file.name}</p>
                <p role={job.state === 'sending' ? undefined : 'status'}>{text[job.state]}{job.state === 'sending' ? ` · ${job.progress}%` : ''}</p>
                {job.state === 'sending' && <progress aria-label={`${text.sending}: ${job.file.name}`}
                  className="w-full accent-wedding-800" value={job.progress} max={100} />}
                {job.state === 'sending' && <button type="button" onClick={() => controllers.current.get(job.key)?.abort()}>{text.cancel}</button>}
                {(job.state === 'failed' || job.state === 'cancelled') && (
                  <button type="button" disabled={working} onClick={() => void run([job])}>{text.retry}</button>
                )}
              </li>
            ))}
          </ul>
          {settings && (settings.gallery_enabled || settings.messages_enabled || settings.voice_enabled) &&
            <GuestContent eventId={eventId} settings={settings} language={language}
            addVoice={file => add([file])} busy={working} />}
        </>
      )}
    </main>
  )
}

'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'

type Media = { id: string; filename: string; content_type: string }
type Message = { id: string; message_text: string }
type Settings = { gallery_enabled: boolean; messages_enabled: boolean; voice_enabled: boolean }

export default function GuestContent({ eventId, settings, language, addVoice, busy }: {
  eventId: string; settings: Settings; language: 'el' | 'en'; addVoice: (file: File) => void; busy: boolean
}) {
  const el = language === 'el'
  const base = `/api/events/${eventId}`
  const [open, setOpen] = useState(false)
  const [media, setMedia] = useState<Media[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [view, setView] = useState<{ url: string; item: Media } | null>(null)
  const [notice, setNotice] = useState('')
  const [recording, setRecording] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(false)
  const requestingMic = useRef(false)
  const messageRequest = useRef<{ message: string; id: string } | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timeout.current) clearTimeout(timeout.current)
      recorder.current?.stream.getTracks().forEach(track => track.stop())
    }
  }, [])

  async function gallery(next?: string) {
    try {
      const [response, book] = await Promise.all([
        fetch(`${base}/gallery${next ? `?cursor=${next}` : ''}`),
        next ? null : fetch(`${base}/guestbook`),
      ])
      if (!response.ok) throw new Error()
      const page = await response.json()
      setMedia(previous => next ? [...previous, ...page.media] : page.media)
      setCursor(page.next)
      if (book?.ok) setMessages((await book.json()).messages)
      setOpen(true)
    } catch {
      setNotice(el ? 'Η συλλογή δεν είναι διαθέσιμη.' : 'Gallery unavailable.')
    }
  }

  async function viewMedia(item: Media) {
    try {
      const response = await fetch(`${base}/gallery?media=${item.id}`)
      if (!response.ok) throw new Error()
      setView({ url: (await response.json()).url, item })
    } catch {
      setNotice(el ? 'Το αρχείο δεν είναι διαθέσιμο.' : 'Media unavailable.')
    }
  }

  async function postMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const message = String(new FormData(form).get('message') ?? '').trim()
    if (!message) return
    if (messageRequest.current?.message !== message) messageRequest.current = { message, id: crypto.randomUUID() }
    try {
      const response = await fetch(`${base}/guestbook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, requestId: messageRequest.current.id }),
      })
      if (!response.ok) throw new Error()
      messageRequest.current = null
      form.reset()
      setNotice(el ? 'Το μήνυμα παραλήφθηκε.' : 'Message received.')
    } catch {
      setNotice(el ? 'Το μήνυμα δεν εστάλη.' : 'Message could not be sent.')
    }
  }

  async function startVoice() {
    if (requestingMic.current || recorder.current || busy) return
    requestingMic.current = true
    let stream: MediaStream | undefined
    try {
      const type = ['audio/webm', 'audio/mp4'].find(value =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(value))
      if (!type) throw new Error()
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) return
      const activeStream = stream
      const capture = new MediaRecorder(activeStream, { mimeType: type })
      const chunks: Blob[] = []
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      capture.onstop = () => {
        if (timeout.current) clearTimeout(timeout.current)
        activeStream.getTracks().forEach(track => track.stop())
        recorder.current = null
        if (!mounted.current) return
        setRecording(false)
        if (chunks.length) addVoice(new File(chunks, type === 'audio/mp4' ? 'voice.m4a' : 'voice.webm', { type }))
      }
      capture.start(1000)
      recorder.current = capture
      stream = undefined
      timeout.current = setTimeout(() => { if (capture.state === 'recording') capture.stop() }, 120000)
      setRecording(true)
    } catch {
      setNotice(el ? 'Το μικρόφωνο δεν είναι διαθέσιμο.' : 'Microphone unavailable.')
    } finally {
      stream?.getTracks().forEach(track => track.stop())
      requestingMic.current = false
    }
  }

  return (
    <section className="space-y-4 border-t pt-4">
      {settings.messages_enabled && <form className="space-y-2" onSubmit={postMessage}>
        <label className="block">{el ? 'Μήνυμα ευχών' : 'Guestbook message'}
          <textarea className="input-field block w-full" name="message" maxLength={1000} required />
        </label>
        <button className="underline">{el ? 'Αποστολή μηνύματος' : 'Send message'}</button>
      </form>}
      {settings.voice_enabled && (recording ?
        <button type="button" className="underline" onClick={() => recorder.current?.stop()}>
          {el ? 'Διακοπή και αποστολή' : 'Stop and send'}
        </button> : <button type="button" className="underline" disabled={busy} onClick={() => void startVoice()}>
          {el ? 'Ηχογράφηση ευχής' : 'Record a voice message'}
        </button>)}
      {settings.gallery_enabled && (
        <div>
          <button type="button" className="underline" onClick={() => open ? setOpen(false) : void gallery()}>
            {el ? 'Συλλογή αναμνήσεων' : 'Browse gallery'}
          </button>
          {open && <>
            <ul className="grid grid-cols-2 gap-2">
              {media.map(item => <li key={item.id}><button type="button" className="break-all underline"
                onClick={() => void viewMedia(item)}>{item.filename}</button></li>)}
            </ul>
            {cursor && <button type="button" className="underline" onClick={() => void gallery(cursor)}>
              {el ? 'Περισσότερα' : 'Load more'}
            </button>}
            <ul>{messages.map(message => <li key={message.id}>{message.message_text}</li>)}</ul>
          </>}
        </div>
      )}
      {view && <div role="dialog" aria-modal="true" className="modal-overlay">
        <div className="modal-content space-y-4 p-5">
          <button type="button" className="underline" onClick={() => setView(null)}>{el ? 'Κλείσιμο' : 'Close'}</button>
          {view.item.content_type.startsWith('image/') ? <img src={view.url} alt={view.item.filename} /> :
            view.item.content_type.startsWith('audio/') ? <audio src={view.url} controls /> :
              <video src={view.url} controls />}
          <a href={view.url} className="underline" target="_blank" rel="noreferrer">{el ? 'Πρωτότυπο' : 'Open original'}</a>
        </div>
      </div>}
      {notice && <p role="status">{notice}</p>}
    </section>
  )
}

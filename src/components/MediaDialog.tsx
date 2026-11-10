'use client'

import { useEffect, useId, useRef, useState } from 'react'

export default function MediaDialog({ url, originalHref, type, title, closeLabel, originalLabel, errorLabel, onDismiss }: {
  url: string; originalHref: string; type?: string; title?: string; closeLabel: string; originalLabel: string
  errorLabel: string; onDismiss: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const original = useRef<HTMLAnchorElement>(null)
  const heading = useId()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const element = dialog.current
    const focused = document.activeElement
    element?.showModal()
    close.current?.focus({ preventScroll: true })
    return () => {
      element?.close()
      if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true })
    }
  }, [])
  const onError = () => setFailed(true)
  return (
    <dialog ref={dialog} aria-labelledby={heading} className="media-dialog"
      onCancel={event => { event.preventDefault(); onDismiss() }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const current = document.activeElement
        const first = close.current
        const last = original.current
        const simplePreview = failed || type?.startsWith('image/')
        if (current === first && (event.shiftKey || simplePreview)) {
          event.preventDefault()
          last?.focus()
        } else if (current === last && (!event.shiftKey || simplePreview)) {
          event.preventDefault()
          first?.focus()
        }
      }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={heading} className="min-w-0 flex-1 text-lg">{title || originalLabel}</h2>
        <button ref={close} type="button" className="btn-secondary" onClick={onDismiss}>{closeLabel}</button>
      </div>
      {failed ? <p role="status">{errorLabel}</p> : type?.startsWith('image/') ?
        <img src={url} alt={title ?? ''} className="dialog-media" onError={onError} /> :
        type?.startsWith('audio/') ? <audio src={url} controls className="w-full" onError={onError} /> :
          <video src={url} controls playsInline className="dialog-media" onError={onError} />}
      <a ref={original} href={originalHref} target="_blank" rel="noreferrer" className="btn-secondary inline-flex">{originalLabel}</a>
    </dialog>
  )
}

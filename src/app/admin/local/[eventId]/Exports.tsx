'use client'

import { useEffect, useState } from 'react'

type Archive = { id: string; state: string; progress: number; item_count: number; downloadable: boolean; sha256?: string }

export default function Exports({ eventId }: { eventId: string }) {
  const path = `/api/admin/events/${eventId}/exports`
  const [jobs, setJobs] = useState<Archive[]>([])
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [download, setDownload] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    async function refresh() {
      try {
        const response = await fetch(path, { signal: controller.signal })
        if (response.ok) setJobs((await response.json()).exports)
      } catch {
        // An intermittent polling failure does not discard current progress.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 4000)
      }
    }
    void refresh()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [path])

  async function start() {
    setPending(true)
    setNotice('')
    try {
      const response = await fetch(path, { method: 'POST' })
      setNotice(response.ok ? 'Archive queued.' : 'Archive could not be queued.')
    } catch {
      setNotice('Archive could not be queued.')
    } finally {
      setPending(false)
    }
  }

  async function getArchive(id: string) {
    setDownload('')
    try {
      const response = await fetch(`${path}?download=${id}`)
      if (!response.ok) throw new Error()
      setDownload((await response.json()).url)
    } catch {
      setNotice('Archive link unavailable.')
    }
  }

  return <section className="space-y-2 rounded border p-4">
    <h2 className="text-xl">Event archive</h2>
    <button type="button" className="btn-primary" disabled={pending || jobs.some(job =>
      job.state === 'queued' || job.state === 'running')} onClick={() => void start()}>Create ZIP archive</button>
    <ul className="space-y-2">{jobs.map(job => <li key={job.id}>
      {job.state} · {job.progress}% {job.state === 'ready' && <>· {job.item_count} originals</>}
      {job.downloadable && <button type="button" className="ml-3 underline"
        onClick={() => void getArchive(job.id)}>Prepare download</button>}
      {job.sha256 && <p className="break-all text-xs">SHA-256 {job.sha256}</p>}
    </li>)}</ul>
    {download && <a className="underline" href={download} rel="noreferrer">Download ZIP</a>}
    {notice && <p role="status">{notice}</p>}
  </section>
}

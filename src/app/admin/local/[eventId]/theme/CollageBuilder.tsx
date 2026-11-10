'use client'

import { useEffect, useState } from 'react'
import { collageLimit, makeCollage, type Layout } from '@/lib/client/collage'

export default function CollageBuilder({ onPreview, onUse }: {
  onPreview: (url: string | null) => void
  onUse: (file: File) => Promise<boolean>
}) {
  const [files, setFiles] = useState<File[]>([])
  const [layout, setLayout] = useState<Layout>('grid')
  const [result, setResult] = useState<File | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!files.length) return
    const controller = new AbortController()
    let url: string | undefined
    void makeCollage(files, layout, controller.signal).then(({ file, skipped }) => {
      if (controller.signal.aborted) return
      url = URL.createObjectURL(file)
      onPreview(url)
      setResult(file)
      setNotice(skipped ? `Preview ready. ${skipped} photos could not be read.` : 'Preview ready.')
    }).catch(() => {
      if (!controller.signal.aborted) setNotice('Could not build the collage. Try JPEG, PNG or WebP photos.')
    })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
      onPreview(null)
    }
  }, [files, layout, onPreview])

  function clear() {
    setFiles([])
    setResult(null)
    setNotice('')
  }

  return <section className="card space-y-3" aria-labelledby="photo-collage">
    <h2 id="photo-collage" className="text-xl">Photo collage background</h2>
    <p>Choose up to 80 photos and preview layouts here. Using the finished collage replaces the draft cover. The source photos stay on your device.</p>
    <label className="block">Collage photos
      <input className="input-field block w-full" type="file" multiple accept="image/jpeg,image/png,image/webp"
        onChange={event => {
          const selected = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (!selected.length) return
          if (selected.length > collageLimit) {
            clear()
            setNotice('Select at most 80 photos at once.')
            return
          }
          setResult(null)
          setNotice(`Building a preview from ${selected.length} photos…`)
          setFiles(selected)
        }} />
    </label>
    <label className="block">Collage layout
      <select className="input-field block w-full" value={layout} onChange={event => {
        setLayout(event.target.value === 'featured' ? 'featured' : 'grid')
        setResult(null)
        if (files.length) setNotice('Updating preview…')
      }}>
        <option value="grid">Even grid</option>
        <option value="featured">Featured first photo</option>
      </select>
    </label>
    <p role="status">{notice}</p>
    <div className="flex flex-wrap gap-2">
      <button className="btn-secondary" type="button" disabled={!result}
        onClick={async () => { if (result && await onUse(result)) clear() }}>Use collage in draft</button>
      {files.length > 0 && <button className="btn-secondary" type="button" onClick={clear}>Clear collage preview</button>}
    </div>
    {files.length > 0 && <a href="#guest-theme-preview" className="inline-block underline">Go to guest preview</a>}
  </section>
}

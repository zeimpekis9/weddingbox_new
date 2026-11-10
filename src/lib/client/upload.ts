type Progress = (bytes: number) => void
type ResponseData = {
  id?: string; state?: string; mode?: string; url?: string
  headers?: Record<string, string>; partSize?: number; receivedParts?: number[]
  staged?: boolean; error?: string; active?: boolean
}

class UploadError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

const extensions: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime',
}

export function uploadType(file: File) {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  const extension = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
  return Object.prototype.hasOwnProperty.call(extensions, extension) ? extensions[extension] : file.type
}

async function request(url: string, signal: AbortSignal, body?: unknown): Promise<ResponseData> {
  for (let attempt = 0; ; attempt++) {
    let retryAfter = 0
    try {
      const result = await fetch(url, {
        signal, method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await result.json()
      if (result.ok && result.status !== 202) return data
      if (attempt >= 4 || ![202, 429, 502, 503, 504].includes(result.status)) {
        throw new UploadError(result.status, data.error || 'Upload unavailable')
      }
      retryAfter = Math.min(Number(result.headers.get('Retry-After')) * 1000 || 0, 10000)
    } catch (error) {
      if (signal.aborted || attempt >= 4 || error instanceof UploadError) throw error
    }
    await delay(attempt, signal, retryAfter)
  }
}

async function delay(attempt: number, signal: AbortSignal, minimum = 0) {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, Math.max(minimum, 500 * 2 ** attempt) + Math.random() * 400)
    signal.addEventListener('abort', abort, { once: true })
  })
}

function put(url: string, file: Blob, headers: Record<string, string>, signal: AbortSignal, progress: Progress) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.timeout = 120000
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
    const abort = () => xhr.abort()
    signal.addEventListener('abort', abort, { once: true })
    xhr.upload.onprogress = event => progress(event.loaded)
    xhr.onloadend = () => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) reject(signal.reason)
      else if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new UploadError(xhr.status, 'Transfer failed'))
    }
    xhr.send(file)
  })
}

export async function fingerprint(file: File, signal: AbortSignal) {
  const { sha256 } = await import('@noble/hashes/sha2.js')
  const hash = sha256.create()
  for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
    signal.throwIfAborted()
    hash.update(new Uint8Array(await file.slice(offset, offset + 1024 * 1024).arrayBuffer()))
  }
  return Array.from(hash.digest(), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function transfer(eventId: string, file: File, requestId: string, signal: AbortSignal,
  progress: Progress, onSession: (id: string) => void) {
  const base = `/api/events/${eventId}/uploads`
  const body = { requestId, filename: file.name, type: uploadType(file), bytes: file.size }
  let start: ResponseData
  for (let attempt = 0; ; attempt++) {
    start = await request(base, signal, body)
    if (start.mode !== 'initializing') break
    if (attempt >= 4) throw new Error('Upload is still starting')
    await delay(attempt, signal)
  }
  if (!start.id) throw new Error('Upload could not be started')
  onSession(start.id)
  if (start.state === 'uploaded') return
  if (start.state !== 'pending' || !start.mode) throw new Error('Upload is closed')
  const path = `${base}/${start.id}`
  const current = await request(path, signal)
  if (current.state === 'uploaded') return
  if (!current.active || current.state !== 'pending') throw new Error('Upload is closed')
  if (!current.staged && start.mode === 'single' && start.url) {
    for (let attempt = 0; ; attempt++) {
      try {
        await put(start.url, file, start.headers ?? {}, signal, progress)
        break
      } catch (error) {
        if (error instanceof UploadError && error.status === 412) break
        if (signal.aborted || attempt >= 3) throw error
        await delay(attempt, signal)
      }
    }
  }
  if (!current.staged && start.mode === 'multipart' && start.partSize) {
    const received = new Set(current.receivedParts ?? [])
    for (let offset = 0, part = 1; offset < file.size; offset += start.partSize, part++) {
      const chunk = file.slice(offset, offset + start.partSize)
      if (!received.has(part)) {
        for (let attempt = 0; ; attempt++) {
          const signed = await request(path, signal, { action: 'part', part })
          if (!signed.url) throw new Error('Part authorization failed')
          try {
            await put(signed.url, chunk, {}, signal, loaded => progress(offset + loaded))
            break
          } catch (error) {
            if (signal.aborted || attempt >= 3) throw error
            await delay(attempt, signal)
          }
        }
      }
      progress(offset + chunk.size)
    }
  }
  const complete = await request(path, signal, { action: 'complete' })
  if (complete.id !== start.id || complete.state !== 'uploaded') throw new Error('Receipt could not be verified')
}

export async function cancelTransfer(eventId: string, id: string) {
  await request(`/api/events/${eventId}/uploads/${id}`, AbortSignal.timeout(6000), { action: 'cancel' })
}

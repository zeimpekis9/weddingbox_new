import sharp from 'sharp'

const maxBytes = 2 * 1024 * 1024
const formats: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }

export function artworkKey(eventId: string, id: string) {
  return `events/${eventId.toLowerCase()}/theme/${id.toLowerCase()}.webp`
}

export async function readArtwork(request: Request, kind: 'cover' | 'monogram') {
  const format = formats[request.headers.get('content-type') ?? '']
  if (!format || !request.body || Number(request.headers.get('content-length')) > maxBytes) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    const input = sharp(Buffer.concat(chunks), { limitInputPixels: 12_000_000, failOn: 'warning' })
    const metadata = await input.metadata()
    if (metadata.format !== format || (metadata.pages ?? 1) > 1) return null
    const width = kind === 'cover' ? 1600 : 384
    return await input.rotate().resize(width, width, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

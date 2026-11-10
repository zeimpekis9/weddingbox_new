import { fileTypeFromBuffer } from 'file-type'

export const partSize = 8 * 1024 * 1024
export const multipartThreshold = 32 * 1024 * 1024

export function completeParts(parts, size) {
  const expected = Math.ceil(size / partSize)
  if (parts.length !== expected) return null
  const sorted = [...parts].sort((left, right) => left.PartNumber - right.PartNumber)
  if (sorted.some((part, index) => part.PartNumber !== index + 1 || !part.ETag ||
      part.Size !== Math.min(partSize, size - index * partSize))) return null
  return sorted
}

export function verifiedHead(head, id, bytes) {
  return Boolean(head?.ETag && head.ContentLength === bytes && head.Metadata?.['upload-id'] === id)
}

export async function contentMatches(bytes, expected) {
  try {
    const detected = await fileTypeFromBuffer(bytes)
    return detected?.mime === expected ||
      (expected === 'image/heic' && detected?.mime === 'image/heif') ||
      (expected === 'image/heif' && detected?.mime === 'image/heic')
  } catch {
    return false
  }
}

export async function verifyOriginal(storage, object) {
  const { id, bytes, contentType, stage, original, providerId } = object
  let head = await storage.head(original)
  if (!head) {
    let staged = await storage.head(stage)
    if (!staged && providerId) {
      const parts = completeParts(await storage.parts(stage, providerId), bytes)
      if (!parts) return 'incomplete'
      await storage.complete(stage, providerId, parts)
      staged = await storage.head(stage)
    }
    if (!staged) return 'incomplete'
    // Single PUTs are bound to the unique staging key by the signature and overwrite guard.
    if (!staged.ETag || staged.ContentLength !== bytes || staged.ContentType !== contentType ||
        (providerId && staged.Metadata?.['upload-id'] !== id) ||
        !await contentMatches(await storage.sniff(stage, staged.ETag), contentType)) return 'invalid'
    await storage.copy(stage, original, staged.ETag, id, contentType)
    head = await storage.head(original)
  }
  return verifiedHead(head, id, bytes) && head.ContentType === contentType ? 'verified' : 'incomplete'
}

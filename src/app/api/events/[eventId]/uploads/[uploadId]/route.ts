import { guestGrant, uuid } from '@/lib/server/guest-access'
import { json, sameOrigin, smallJson } from '@/lib/server/http'
import { cancelUpload, finalizeUpload, findUpload, uploadPart, uploadStatus } from '@/lib/server/uploads'

type Context = RouteContext<'/api/events/[eventId]/uploads/[uploadId]'>

async function ownedUpload(request: Request, context: Context) {
  const { eventId, uploadId } = await context.params
  if (!uuid.test(uploadId)) return null
  const grant = await guestGrant(request, eventId)
  return grant ? findUpload(eventId, grant, uploadId) : null
}

export async function GET(request: Request, context: Context) {
  try {
    const upload = await ownedUpload(request, context)
    return upload ? json(await uploadStatus(upload)) : json({ error: 'Upload not found' }, 404)
  } catch {
    return json({ error: 'Upload service unavailable' }, 503, { 'Retry-After': '2' })
  }
}

export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const body = await smallJson(request).catch(() => null)
  if (!body || typeof body !== 'object' || !('action' in body)) return json({ error: 'Invalid action' }, 400)
  try {
    const upload = await ownedUpload(request, context)
    if (!upload) return json({ error: 'Upload not found' }, 404)
    if (body.action === 'part' && 'part' in body && typeof body.part === 'number') {
      const url = await uploadPart(upload, body.part)
      return url ? json({ url }) : json({ error: 'Invalid part' }, 409)
    }
    if (body.action === 'cancel') {
      return await cancelUpload(upload) ? json({ state: 'cancelled' }) : json({ error: 'Upload busy or closed' }, 409)
    }
    if (body.action === 'complete') {
      const state = await finalizeUpload(upload)
      if (state === 'uploaded') return json({ id: upload.id, state })
      if (state === 'busy') return json({ state }, 202, { 'Retry-After': '2' })
      return json({ error: state }, state === 'invalid' ? 422 : 409)
    }
    return json({ error: 'Invalid action' }, 400)
  } catch {
    return json({ error: 'Upload service unavailable' }, 503, { 'Retry-After': '2' })
  }
}

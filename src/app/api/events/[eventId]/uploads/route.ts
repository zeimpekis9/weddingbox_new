import { guestGrant, uuid } from '@/lib/server/guest-access'
import { json, sameOrigin, smallJson } from '@/lib/server/http'
import { acceptedFile, initialize, uploadInstructions } from '@/lib/server/uploads'

export async function POST(request: Request, context: RouteContext<'/api/events/[eventId]/uploads'>) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const { eventId } = await context.params
  const body = await smallJson(request).catch(() => null)
  if (!body || typeof body !== 'object' || !('requestId' in body) || typeof body.requestId !== 'string' ||
      !uuid.test(body.requestId) || !('filename' in body) || typeof body.filename !== 'string' ||
      !('type' in body) || typeof body.type !== 'string' || !('bytes' in body) || typeof body.bytes !== 'number') {
    return json({ error: 'Invalid upload' }, 400)
  }
  const file = { requestId: body.requestId, filename: body.filename, type: body.type, bytes: body.bytes }
  if (!acceptedFile(file)) return json({ error: 'Unsupported file type or size' }, 422)
  try {
    const grant = await guestGrant(request, eventId)
    if (!grant) return json({ error: 'Guest access required' }, 403)
    const result = await initialize(eventId, grant, file)
    if ('error' in result) return json({ error: result.error }, result.status)
    return json(await uploadInstructions(result.upload))
  } catch {
    return json({ error: 'Upload service unavailable' }, 503, { 'Retry-After': '2' })
  }
}

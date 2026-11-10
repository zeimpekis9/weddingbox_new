import { database } from '@/lib/server/db'
import { guestGrant, uuid } from '@/lib/server/guest-access'
import { eventConfig } from '@/lib/server/guest-content'
import { json, sameOrigin, smallJson } from '@/lib/server/http'

type Context = RouteContext<'/api/events/[eventId]/guestbook'>

export async function GET(request: Request, context: Context) {
  const { eventId } = await context.params
  try {
    if (!await guestGrant(request, eventId) || !(await eventConfig(eventId))?.gallery_enabled) {
      return json({ error: 'Guestbook unavailable' }, 404)
    }
    const { rows } = await database().query(`
      SELECT id,message_text,created_at FROM wedding.submissions
      WHERE event_id=$1 AND type='message' AND moderation='approved' AND deleted_at IS NULL
      ORDER BY created_at DESC,id DESC LIMIT 50
    `, [eventId])
    return json({ messages: rows })
  } catch {
    return json({ error: 'Guestbook unavailable' }, 503)
  }
}

export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const { eventId } = await context.params
  const body = await smallJson(request).catch(() => null)
  if (!body || typeof body !== 'object' || !('message' in body) || typeof body.message !== 'string' ||
      !body.message.trim() || body.message.length > 1000 || !('requestId' in body) ||
      typeof body.requestId !== 'string' || !uuid.test(body.requestId)) return json({ error: 'Invalid message' }, 400)
  try {
    const grant = await guestGrant(request, eventId)
    if (!grant || !(await eventConfig(eventId))?.messages_enabled) return json({ error: 'Forbidden' }, 403)
    const result = await database().query(`
      INSERT INTO wedding.submissions (event_id,type,message_text,client_request_id,guest_grant_hash)
      SELECT $1,'message',$2,$3,$4 WHERE
        (SELECT count(*) FROM wedding.submissions WHERE event_id=$1 AND guest_grant_hash=$4
          AND created_at > now()-interval '10 minutes') < 10
      ON CONFLICT DO NOTHING RETURNING id
    `, [eventId, body.message.trim(), body.requestId, grant])
    if (result.rowCount) return json({ received: true }, 201)
    const { rows: [prior] } = await database().query(`
      SELECT message_text FROM wedding.submissions WHERE event_id=$1 AND guest_grant_hash=$2 AND client_request_id=$3
    `, [eventId, grant, body.requestId])
    if (prior) return prior.message_text === body.message.trim() ? json({ received: true }) : json({ error: 'Conflicting message' }, 409)
    return json({ error: 'Message limit reached' }, 429, { 'Retry-After': '600' })
  } catch {
    return json({ error: 'Guestbook unavailable' }, 503)
  }
}

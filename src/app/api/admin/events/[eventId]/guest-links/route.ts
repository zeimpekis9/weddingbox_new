import { randomBytes } from 'node:crypto'
import { adminToken, hashToken } from '@/lib/server/admin-auth'
import { database } from '@/lib/server/db'
import { uuid } from '@/lib/server/guest-access'
import { json, sameOrigin, smallJson } from '@/lib/server/http'

export async function POST(request: Request, context: RouteContext<'/api/admin/events/[eventId]/guest-links'>) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const { eventId } = await context.params
  const session = adminToken(request)
  if (!session || !uuid.test(eventId)) return json({ error: 'Forbidden' }, 403)
  const token = randomBytes(32).toString('base64url')
  try {
    const { rows: [link] } = await database().query(`
      INSERT INTO wedding.guest_links (event_id, token_hash, expires_at)
      SELECT id,$3,now() + interval '7 days' FROM wedding.admin_events($1)
      WHERE id=$2 AND role='owner'
      RETURNING id,expires_at
    `, [hashToken(session), eventId, hashToken(token)])
    return link ? json({ ...link, token }, 201) : json({ error: 'Forbidden' }, 403)
  } catch {
    return json({ error: 'Guest links unavailable' }, 503)
  }
}

export async function DELETE(request: Request, context: RouteContext<'/api/admin/events/[eventId]/guest-links'>) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const { eventId } = await context.params
  const session = adminToken(request)
  const body = await smallJson(request).catch(() => null)
  if (!session || !uuid.test(eventId) || !body || typeof body !== 'object' ||
      !('id' in body) || typeof body.id !== 'string' || !uuid.test(body.id)) {
    return json({ error: 'Forbidden' }, 403)
  }
  try {
    const result = await database().query(`
      UPDATE wedding.guest_links SET revoked_at=COALESCE(revoked_at,now())
      WHERE id=$3 AND event_id IN (
        SELECT id FROM wedding.admin_events($1) WHERE id=$2 AND role='owner'
      )
    `, [hashToken(session), eventId, body.id])
    return result.rowCount ? json({ revoked: true }) : json({ error: 'Forbidden' }, 403)
  } catch {
    return json({ error: 'Guest links unavailable' }, 503)
  }
}

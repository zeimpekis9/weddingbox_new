import { adminToken, hashToken } from '@/lib/server/admin-auth'
import { database } from '@/lib/server/db'
import { uuid } from '@/lib/server/guest-access'
import { json } from '@/lib/server/http'
import { r2 } from '@/lib/server/r2'

export async function GET(request: Request, context: RouteContext<'/api/admin/events/[eventId]/display'>) {
  const { eventId } = await context.params
  const token = adminToken(request)
  if (!token || !uuid.test(eventId)) return json({ error: 'Display unavailable' }, 404)
  const session = hashToken(token)
  try {
    const db = database()
    const { rows: [event] } = await db.query('SELECT title,role FROM wedding.admin_events($1) WHERE id=$2', [session,eventId])
    if (!event) return json({ error: 'Display unavailable' }, 404)
    const values = [session,eventId]
    const [photos, messages] = await Promise.all([
      db.query(`SELECT id,COALESCE(thumbnail_key,object_key) AS object_key FROM wedding.media WHERE moderation='approved' AND content_type LIKE 'image/%'
        AND event_id IN (SELECT id FROM wedding.admin_events($1) WHERE id=$2)
        ORDER BY created_at DESC,id DESC LIMIT 12`, values),
      db.query(`SELECT id,message_text FROM wedding.submissions WHERE moderation='approved' AND type='message'
        AND deleted_at IS NULL AND event_id IN (SELECT id FROM wedding.admin_events($1) WHERE id=$2)
        ORDER BY created_at DESC,id DESC LIMIT 50`, values),
    ])
    const images = await Promise.all(photos.rows.map(async photo => ({
      id: photo.id, url: await r2().signedGet(photo.object_key),
    })))
    return json({ title: event.title, owner: event.role === 'owner', photos: images, messages: messages.rows })
  } catch {
    return json({ error: 'Display temporarily unavailable' }, 503)
  }
}

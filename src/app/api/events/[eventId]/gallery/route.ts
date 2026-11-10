import { database } from '@/lib/server/db'
import { guestGrant, uuid } from '@/lib/server/guest-access'
import { eventConfig } from '@/lib/server/guest-content'
import { json } from '@/lib/server/http'
import { r2 } from '@/lib/server/r2'

type Context = RouteContext<'/api/events/[eventId]/gallery'>

export async function GET(request: Request, context: Context) {
  const { eventId } = await context.params
  const params = new URL(request.url).searchParams
  const cursor = params.get('cursor')
  const id = params.get('media')
  if ((cursor && !uuid.test(cursor)) || (id && !uuid.test(id))) return json({ error: 'Invalid media reference' }, 400)
  try {
    if (!await guestGrant(request, eventId) || !(await eventConfig(eventId))?.gallery_enabled) {
      return json({ error: 'Gallery unavailable' }, 404)
    }
    if (id) {
      const { rows: [media] } = await database().query<{ object_key: string }>(`
        SELECT object_key FROM wedding.media WHERE event_id=$1 AND id=$2 AND moderation='approved'
      `, [eventId, id])
      if (!media) return json({ error: 'Media unavailable' }, 404)
      const url = await r2().signedGet(media.object_key)
      return params.get('open') === '1'
        ? new Response(null, { status: 303, headers: { Location: url, 'Cache-Control': 'no-store' } })
        : json({ url })
    }
    const { rows } = await database().query(`
      SELECT id, filename, content_type, created_at, thumbnail_key FROM wedding.media
      WHERE event_id=$1 AND moderation='approved' AND
        ($2::uuid IS NULL OR (created_at,id) < (
          SELECT created_at,id FROM wedding.media WHERE event_id=$1 AND id=$2 AND moderation='approved'
        ))
      ORDER BY created_at DESC,id DESC LIMIT 25
    `, [eventId, cursor])
    const media = await Promise.all(rows.slice(0,24).map(async ({ thumbnail_key, ...item }) => ({
      ...item, thumbnail: thumbnail_key ? await r2().signedGet(thumbnail_key) : null,
    })))
    return json({ media, next: rows.length === 25 ? rows[23].id : null })
  } catch {
    return json({ error: 'Gallery unavailable' }, 503)
  }
}

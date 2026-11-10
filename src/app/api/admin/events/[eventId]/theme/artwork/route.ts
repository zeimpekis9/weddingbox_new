import { randomUUID } from 'node:crypto'
import { database } from '@/lib/server/db'
import { themeOwner } from '@/lib/server/event-theme'
import { json, sameOrigin } from '@/lib/server/http'
import { r2 } from '@/lib/server/r2'
import { artworkKey, readArtwork } from '@/lib/server/theme-artwork'

type Context = RouteContext<'/api/admin/events/[eventId]/theme/artwork'>

export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const { eventId } = await context.params
  const kind = new URL(request.url).searchParams.get('kind')
  if (kind !== 'cover' && kind !== 'monogram') return json({ error: 'Unknown artwork type' }, 400)
  const id = randomUUID()
  try {
    const session = await themeOwner(request, eventId)
    if (!session) return json({ error: 'Theme studio unavailable' }, 404)
    const body = await readArtwork(request, kind)
    if (!body) return json({ error: 'Use a single JPEG, PNG or WebP up to 2 MiB and 12 megapixels' }, 422)
    const db = database()
    const store = r2()
    const key = artworkKey(eventId, id)
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended(lower($1), 674391))', [eventId])
      const reserved = await client.query(`
        INSERT INTO wedding.theme_assets (event_id,id,kind)
        SELECT id,$3,$4 FROM wedding.admin_events($2) WHERE id=$1 AND role='owner'
        AND (SELECT count(*) FROM wedding.theme_assets WHERE event_id=$1) < 80
      `, [eventId, session, id, kind])
      await client.query('COMMIT')
      if (!reserved.rowCount) return json({ error: 'Artwork limit reached or owner access expired' }, 409)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    try {
      await store.putThemeImage(key, body)
    } catch (error) {
      await Promise.allSettled([
        store.deleteThemeImage(key), db.query('DELETE FROM wedding.theme_assets WHERE event_id=$1 AND id=$2 AND NOT ready', [eventId, id]),
      ])
      throw error
    }
    await db.query('UPDATE wedding.theme_assets SET ready=true WHERE event_id=$1 AND id=$2', [eventId, id])
    return json({ id }, 201)
  } catch {
    return json({ error: 'Artwork upload temporarily unavailable' }, 503)
  }
}

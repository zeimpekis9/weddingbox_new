import { database } from '@/lib/server/db'
import { themeOwner } from '@/lib/server/event-theme'
import { guestGrant, uuid } from '@/lib/server/guest-access'
import { json } from '@/lib/server/http'
import { r2 } from '@/lib/server/r2'
import { artworkKey } from '@/lib/server/theme-artwork'

export async function GET(request: Request, context: RouteContext<'/api/events/[eventId]/theme-assets/[assetId]'>) {
  const { eventId, assetId } = await context.params
  const unavailable = () => json({ error: 'Artwork unavailable' }, 404)
  if (!uuid.test(eventId) || !uuid.test(assetId)) return unavailable()
  try {
    const owner = Boolean(await themeOwner(request, eventId))
    if (!owner && !await guestGrant(request, eventId)) return unavailable()
    const result = await database().query(`
      SELECT 1 FROM wedding.theme_assets AS asset LEFT JOIN wedding.event_themes AS theme USING (event_id)
      WHERE asset.event_id=$1 AND asset.id=$2 AND asset.ready AND ($3 OR theme.published->>asset.kind=$2::uuid::text)
    `, [eventId, assetId, owner])
    if (!result.rowCount) return unavailable()
    return new Response(null, { status: 303, headers: {
      Location: await r2().signedGet(artworkKey(eventId, assetId)), 'Cache-Control': 'private, no-store',
    } })
  } catch {
    return unavailable()
  }
}

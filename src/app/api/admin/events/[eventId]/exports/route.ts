import { adminToken, hashToken } from '@/lib/server/admin-auth'
import { database } from '@/lib/server/db'
import { uuid } from '@/lib/server/guest-access'
import { json, sameOrigin } from '@/lib/server/http'
import { r2 } from '@/lib/server/r2'

type Context = RouteContext<'/api/admin/events/[eventId]/exports'>
const owner = "SELECT id FROM wedding.admin_events($1) WHERE id=$2 AND role='owner'"

export async function GET(request: Request, context: Context) {
  const { eventId } = await context.params
  const token = adminToken(request)
  if (!token || !uuid.test(eventId)) return json({ error: 'Exports unavailable' }, 404)
  const values = [hashToken(token),eventId]
  const id = new URL(request.url).searchParams.get('download')
  try {
    const db = database()
    if (!(await db.query(owner, values)).rowCount) return json({ error: 'Exports unavailable' }, 404)
    if (id) {
      if (!uuid.test(id)) return json({ error: 'Invalid export' }, 400)
      const { rows: [archive] } = await db.query(`
        SELECT object_key FROM wedding.background_jobs WHERE event_id IN (${owner})
          AND id=$3 AND kind='export' AND state='ready' AND expires_at > now()
      `, [...values,id])
      return archive ? json({ url: await r2().signedGet(archive.object_key, 'wedding-event.zip') }) :
        json({ error: 'Archive unavailable' }, 404)
    }
    const { rows } = await db.query(`
      SELECT id,state,progress,sha256,item_count,created_at,expires_at,expires_at > now() AS downloadable
      FROM wedding.background_jobs WHERE event_id IN (${owner}) AND kind='export'
      ORDER BY created_at DESC LIMIT 10
    `, values)
    return json({ exports: rows })
  } catch {
    return json({ error: 'Exports unavailable' }, 503)
  }
}

export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  if (process.env.WEDDING_UPLOAD_ONLY === '1') return json({ error: 'Exports temporarily paused' }, 503)
  const { eventId } = await context.params
  const token = adminToken(request)
  if (!token || !uuid.test(eventId)) return json({ error: 'Exports unavailable' }, 404)
  try {
    const db = database()
    const values = [hashToken(token),eventId]
    if (!(await db.query(owner, values)).rowCount) return json({ error: 'Exports unavailable' }, 404)
    const { rows: [queued] } = await db.query(`
      INSERT INTO wedding.background_jobs(event_id,kind) SELECT id,'export' FROM (${owner}) AS event
      ON CONFLICT DO NOTHING RETURNING id
    `, values)
    return queued ? json({ id: queued.id }, 202) : json({ error: 'An export is already active' }, 409)
  } catch {
    return json({ error: 'Exports unavailable' }, 503)
  }
}

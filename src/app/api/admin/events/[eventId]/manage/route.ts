import { adminToken, hashToken } from '@/lib/server/admin-auth'
import { database } from '@/lib/server/db'
import { uuid } from '@/lib/server/guest-access'
import { eventConfig, eventProfile } from '@/lib/server/guest-content'
import { json, sameOrigin, smallJson } from '@/lib/server/http'
import { r2 } from '@/lib/server/r2'
import { readR2Config } from '@/lib/server/r2-config'

type Context = RouteContext<'/api/admin/events/[eventId]/manage'>
const membership = 'SELECT id,title,role FROM wedding.admin_events($1) WHERE id=$2'

export async function GET(request: Request, context: Context) {
  const { eventId } = await context.params
  const token = adminToken(request)
  if (!token || !uuid.test(eventId)) return json({ error: 'Event unavailable' }, 404)
  const values = [hashToken(token), eventId]
  try {
    const db = database()
    const { rows: [event] } = await db.query(membership, values)
    if (!event) return json({ error: 'Event unavailable' }, 404)
    const params = new URL(request.url).searchParams
    const mediaId = params.get('media')
    if (mediaId) {
      if (!uuid.test(mediaId)) return json({ error: 'Invalid media' }, 400)
      const { rows: [media] } = await db.query(`
        SELECT object_key FROM wedding.media WHERE id=$3 AND event_id IN (SELECT id FROM wedding.admin_events($1) WHERE id=$2)
      `, [...values, mediaId])
      if (!media) return json({ error: 'Media unavailable' }, 404)
      const url = await r2().signedGet(media.object_key)
      return params.get('open') === '1'
        ? new Response(null, { status: 303, headers: { Location: url, 'Cache-Control': 'no-store' } })
        : json({ url })
    }
    const [media, messages, counts, logs, settings, profile, operations] = await Promise.all([
      db.query(`SELECT id,filename,content_type,moderation,created_at FROM wedding.media
        WHERE event_id IN (SELECT id FROM wedding.admin_events($1) WHERE id=$2)
        ORDER BY created_at DESC,id DESC LIMIT 50`, values),
      db.query(`SELECT id,message_text,moderation,created_at FROM wedding.submissions
        WHERE event_id IN (SELECT id FROM wedding.admin_events($1) WHERE id=$2) AND type='message' AND deleted_at IS NULL
        ORDER BY created_at DESC,id DESC LIMIT 50`, values),
      db.query(`SELECT count(*) FILTER (WHERE content_type LIKE 'image/%')::int AS photos,
        count(*) FILTER (WHERE content_type LIKE 'video/%')::int AS videos,
        count(*) FILTER (WHERE moderation='pending')::int AS pending, COALESCE(sum(byte_size),0)::text AS bytes
        FROM wedding.media WHERE event_id IN (SELECT id FROM wedding.admin_events($1) WHERE id=$2)`, values),
      db.query(`SELECT operation,target_id,created_at FROM wedding.admin_audit
        WHERE event_id IN (SELECT id FROM wedding.admin_events($1) WHERE id=$2 AND role='owner')
        ORDER BY created_at DESC LIMIT 20`, values),
      eventConfig(eventId),
      eventProfile(eventId),
      db.query(`
        WITH allowed AS (SELECT id FROM wedding.admin_events($1) WHERE id=$2),
        uploads AS (
          SELECT count(*) FILTER (WHERE state='pending' AND expires_at > now())::int AS pending_uploads,
            count(*) FILTER (WHERE state='failed')::int AS failed_uploads
          FROM wedding.upload_sessions WHERE event_id IN (SELECT id FROM allowed)
        ), jobs AS (
          SELECT count(*) FILTER (WHERE state IN ('queued','running'))::int AS queued_jobs,
            count(*) FILTER (WHERE state='failed')::int AS failed_jobs
          FROM wedding.background_jobs WHERE event_id IN (SELECT id FROM allowed)
        )
        SELECT * FROM uploads CROSS JOIN jobs
      `, values),
    ])
    let storageConfigured = false
    try { storageConfigured = Boolean(readR2Config()) } catch { /* Configuration errors remain server-side. */ }
    return json({ event, settings, profile, stats: counts.rows[0], media: media.rows, messages: messages.rows, logs: logs.rows,
      operations: { ...operations.rows[0], database_ready: true, storage_configured: storageConfigured,
        upload_only: process.env.WEDDING_UPLOAD_ONLY === '1' } })
  } catch {
    return json({ error: 'Management unavailable' }, 503)
  }
}

export async function PATCH(request: Request, context: Context) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const { eventId } = await context.params
  const token = adminToken(request)
  if (!token || !uuid.test(eventId)) return json({ error: 'Event unavailable' }, 404)
  const body = await smallJson(request).catch(() => null)
  if (!body || typeof body !== 'object' || !('kind' in body)) return json({ error: 'Invalid change' }, 400)
  try {
    const db = database()
    const session = hashToken(token)
    if (body.kind === 'profile') {
      const { title, slug, date, welcome, color } = body as Record<string, unknown>
      if (typeof title !== 'string' || !title.trim() || title.length > 120 ||
          typeof slug !== 'string' || slug.length > 80 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ||
          typeof date !== 'string' || (date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
          typeof welcome !== 'string' || welcome.length > 1000 ||
          typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return json({ error: 'Invalid event details' }, 400)
      const { rows: [result] } = await db.query(
        'SELECT wedding.update_event_profile($1,$2,$3,$4,$5,$6,$7) AS updated',
        [session,eventId,title.trim(),slug,date || null,welcome,color])
      return result.updated ? json({ updated: true }) : json({ error: 'Event unavailable' }, 404)
    }
    if (body.kind === 'settings') {
      const settings = body as Record<string, unknown>
      const flags = ['gallery_enabled','uploads_enabled','messages_enabled','voice_enabled'].map(key => settings[key])
      if (flags.some(flag => typeof flag !== 'boolean')) return json({ error: 'Invalid settings' }, 400)
      const { rows: [result] } = await db.query(
        'SELECT wedding.set_guest_event_config($1,$2,$3,$4,$5,$6) AS updated', [session,eventId,...flags])
      return result.updated ? json({ updated: true }) : json({ error: 'Event unavailable' }, 404)
    }
    if ((body.kind !== 'media' && body.kind !== 'message') || !('id' in body) || typeof body.id !== 'string' ||
        !uuid.test(body.id) || !('state' in body) || typeof body.state !== 'string' ||
        !['pending','approved','rejected','hidden'].includes(body.state)) return json({ error: 'Invalid moderation' }, 400)
    const table = body.kind === 'media' ? 'media' : 'submissions'
    const messageFilter = body.kind === 'message' ? "AND type='message' AND deleted_at IS NULL" : ''
    const result = await db.query(`
      WITH changed AS (
        UPDATE wedding.${table} SET moderation=$4 WHERE id=$3 ${messageFilter}
          AND event_id IN (SELECT id FROM wedding.admin_events($1) WHERE id=$2)
        RETURNING id,event_id
      )
      INSERT INTO wedding.admin_audit(event_id,user_id,operation,target_id)
      SELECT changed.event_id,session.user_id,$5,changed.id
      FROM changed CROSS JOIN wedding.admin_sessions AS session WHERE session.token_hash=$1
    `, [session,eventId,body.id,body.state,`${body.kind}:${body.state}`])
    return result.rowCount ? json({ updated: true }) : json({ error: 'Submission unavailable' }, 404)
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null
    if (code === '23505') return json({ error: 'Event address is already in use' }, 409)
    if (code === '22008' || code === '22007') return json({ error: 'Invalid event date' }, 400)
    return json({ error: 'Management unavailable' }, 503)
  }
}

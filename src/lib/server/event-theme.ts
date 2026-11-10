import { defaultTheme, themeConfig, type ThemeConfig } from '@/lib/theme.mjs'
import { adminToken, hashToken } from './admin-auth'
import { database } from './db'
import { uuid } from './guest-access'

type ThemeRow = { draft: unknown; published: unknown; revision: number; published_revision: number | null }
type Published = { config: ThemeConfig; revision: number | null }
const cache = new Map<string, Published>()

export async function publishedTheme(eventId: string): Promise<Published> {
  eventId = eventId.toLowerCase()
  const cached = cache.get(eventId)
  try {
    const { rows: [row] } = await database().query<ThemeRow>(
      `SELECT published_revision, CASE WHEN published_revision IS DISTINCT FROM $2::integer THEN published END AS published
       FROM wedding.event_themes WHERE event_id=$1`, [eventId, cached?.revision ?? null])
    if (cached && row && row.published_revision === cached.revision) return cached
    const theme = { config: themeConfig(row?.published) ?? defaultTheme, revision: row?.published_revision ?? null }
    if (cache.size >= 128) cache.delete(cache.keys().next().value!)
    cache.set(eventId, theme)
    return theme
  } catch {
    return { config: defaultTheme, revision: null }
  }
}

export async function themeOwner(request: Request, eventId: string) {
  const token = adminToken(request)
  if (!token || !uuid.test(eventId)) return null
  const session = hashToken(token)
  const result = await database().query(
    "SELECT 1 FROM wedding.admin_events($1) WHERE id=$2 AND role='owner'", [session, eventId])
  return result.rowCount ? session : null
}

export async function draftTheme(eventId: string) {
  const { rows: [row] } = await database().query<ThemeRow>('SELECT * FROM wedding.event_themes WHERE event_id=$1', [eventId])
  return { config: themeConfig(row?.draft) ?? defaultTheme, revision: row?.revision ?? 0,
    publishedRevision: row?.published_revision ?? null }
}

export async function saveTheme(eventId: string, session: string, config: ThemeConfig, revision: number, publish: boolean) {
  const { rows: [row] } = await database().query<ThemeRow>(`
    WITH saved AS (
      INSERT INTO wedding.event_themes AS existing(event_id,draft,published,revision,published_revision)
      SELECT $1,$3::jsonb,CASE WHEN $5 THEN $3::jsonb END,$4::integer+1,CASE WHEN $5 THEN $4::integer+1 END
      FROM wedding.admin_events($2) WHERE id=$1 AND role='owner'
        AND ($4=0 OR EXISTS (SELECT 1 FROM wedding.event_themes WHERE event_id=$1 AND revision=$4))
        AND ($6::uuid IS NULL OR EXISTS (SELECT 1 FROM wedding.theme_assets WHERE event_id=$1 AND id=$6 AND kind='cover' AND ready))
        AND ($7::uuid IS NULL OR EXISTS (SELECT 1 FROM wedding.theme_assets WHERE event_id=$1 AND id=$7 AND kind='monogram' AND ready))
      ON CONFLICT (event_id) DO UPDATE SET draft=EXCLUDED.draft, revision=EXCLUDED.revision,
        published=CASE WHEN $5 THEN EXCLUDED.published ELSE existing.published END,
        published_revision=CASE WHEN $5 THEN EXCLUDED.published_revision ELSE existing.published_revision END
      WHERE existing.revision=$4
      RETURNING existing.*
    ), audit AS (
      INSERT INTO wedding.admin_audit(event_id,user_id,operation)
      SELECT saved.event_id,sessions.user_id,'theme_publish' FROM saved
      JOIN wedding.admin_sessions AS sessions ON sessions.token_hash=$2 WHERE $5
    ) SELECT * FROM saved
  `, [eventId, session, JSON.stringify(config), revision, publish, config.cover, config.monogram])
  return row ? { config, revision: row.revision, publishedRevision: row.published_revision } : null
}

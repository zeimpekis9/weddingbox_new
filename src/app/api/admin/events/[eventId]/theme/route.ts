import { draftTheme, saveTheme, themeOwner } from '@/lib/server/event-theme'
import { json, sameOrigin, smallJson } from '@/lib/server/http'
import { themeConfig } from '@/lib/theme.mjs'

type Context = RouteContext<'/api/admin/events/[eventId]/theme'>

export async function GET(request: Request, context: Context) {
  const { eventId } = await context.params
  try {
    if (!await themeOwner(request, eventId)) return json({ error: 'Theme studio unavailable' }, 404)
    return json(await draftTheme(eventId))
  } catch {
    return json({ error: 'Theme studio temporarily unavailable' }, 503)
  }
}

export async function PUT(request: Request, context: Context) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const { eventId } = await context.params
  try {
    const session = await themeOwner(request, eventId)
    if (!session) return json({ error: 'Theme studio unavailable' }, 404)
    const body = await smallJson(request).catch(() => null)
    if (!body || typeof body !== 'object' || !('config' in body) || !('revision' in body) ||
        !('publish' in body) || typeof body.revision !== 'number' || !Number.isInteger(body.revision) ||
        body.revision < 0 || body.revision >= 2147483647 || typeof body.publish !== 'boolean') {
      return json({ error: 'Invalid theme request' }, 400)
    }
    const config = themeConfig(body.config)
    if (!config) return json({ error: 'Invalid or inaccessible theme values' }, 422)
    const saved = await saveTheme(eventId, session, config, body.revision, body.publish)
    return saved ? json(saved) : json({ error: 'Theme changed elsewhere or an artwork reference is unavailable' }, 409)
  } catch {
    return json({ error: 'Theme studio temporarily unavailable' }, 503)
  }
}

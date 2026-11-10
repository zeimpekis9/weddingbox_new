import { exchangeLink, guestCookie, guestGrant } from '@/lib/server/guest-access'
import { json, sameOrigin, smallJson } from '@/lib/server/http'
import { eventConfig, eventProfile } from '@/lib/server/guest-content'

async function settings(eventId: string) {
  const config = await eventConfig(eventId)
  const profile = await eventProfile(eventId)
  return { ...config, event_date: profile?.event_date, primary_color: profile?.primary_color }
}

export async function POST(request: Request, context: RouteContext<'/api/events/[eventId]/access'>) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const { eventId } = await context.params
  const body = await smallJson(request).catch(() => null)
  if (!body || typeof body !== 'object' || !('link' in body) || typeof body.link !== 'string') {
    return json({ error: 'Invalid link' }, 400)
  }
  try {
    if (await guestGrant(request, eventId)) return json({ authorized: true, settings: await settings(eventId) })
    const token = await exchangeLink(eventId, body.link)
    if (!token) return json({ error: 'Invalid or expired link' }, 403)
    return json({ authorized: true, settings: await settings(eventId) }, 200, {
      'Set-Cookie': `${guestCookie}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400`,
    })
  } catch {
    return json({ error: 'Guest access is unavailable' }, 503)
  }
}

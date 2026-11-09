import { adminToken, hashToken, sessionCookie, signIn } from '@/lib/server/admin-auth'
import { database } from '@/lib/server/db'
import { json, sameOrigin, smallJson } from '@/lib/server/http'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const input = await smallJson(request).catch(() => null)
  if (!input || typeof input !== 'object' || !('email' in input) ||
      !('password' in input) || !('code' in input) ||
      typeof input.email !== 'string' || typeof input.password !== 'string' ||
      typeof input.code !== 'string') return json({ error: 'Invalid request' }, 400)
  const email = input.email.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email) ||
      input.password.length < 1 || input.password.length > 256 || !/^\d{6}$/.test(input.code)) {
    return json({ error: 'Invalid request' }, 400)
  }
  try {
    const result = await signIn(email, input.password, input.code)
    if (result.status === 'limited') return json({ error: 'Try again later' }, 429, { 'Retry-After': '600' })
    if (result.status === 'denied') return json({ error: 'Invalid credentials' }, 401)
    return json({ authenticated: true }, 200, { 'Set-Cookie': sessionCookie(result.token, 28800) })
  } catch {
    return json({ error: 'Sign-in unavailable' }, 503)
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  const token = adminToken(request)
  try {
    if (token) await database().query('DELETE FROM wedding.admin_sessions WHERE token_hash = $1', [hashToken(token)])
    return json({ authenticated: false }, 200, { 'Set-Cookie': sessionCookie('', 0) })
  } catch {
    return json({ error: 'Sign-out unavailable' }, 503)
  }
}

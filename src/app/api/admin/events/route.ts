import { adminToken, hashToken } from '@/lib/server/admin-auth'
import { database } from '@/lib/server/db'
import { json } from '@/lib/server/http'

export async function GET(request: Request) {
  const token = adminToken(request)
  if (!token) return json({ error: 'Unauthorized' }, 401)
  try {
    const { rows } = await database().query('SELECT * FROM wedding.admin_events($1)', [hashToken(token)])
    if (!rows.length) return json({ error: 'Unauthorized' }, 401)
    return json({ events: rows })
  } catch {
    return json({ error: 'Events unavailable' }, 503)
  }
}

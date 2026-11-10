import { database } from '@/lib/server/db'
import { json } from '@/lib/server/http'
import { readR2Config } from '@/lib/server/r2-config'

export async function GET() {
  try {
    await database().query('SELECT 1')
    if (readR2Config()) return json({ status: 'ready' })
  } catch {
    // Health responses expose no configuration or connection details.
  }
  return json({ status: 'unavailable' }, 503)
}

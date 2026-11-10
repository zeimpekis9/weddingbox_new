import { json } from '@/lib/server/http'

export function GET() {
  return json({ status: 'ok' })
}

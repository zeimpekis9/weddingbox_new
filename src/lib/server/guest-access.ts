import { randomBytes } from 'node:crypto'
import { hashToken } from './admin-auth'
import { database } from './db'

export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const guestCookie = '__Host-wedding_guest'
const tokenFormat = /^[A-Za-z0-9_-]{43}$/

export async function guestGrant(request: Request, eventId: string) {
  const prefix = `${guestCookie}=`
  const token = request.headers.get('cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(prefix))?.slice(prefix.length)
  if (!token || !tokenFormat.test(token) || !uuid.test(eventId)) return null
  const digest = hashToken(token)
  const result = await database().query(`
    SELECT 1 FROM wedding.guest_grants AS guest
    JOIN wedding.guest_links AS link ON link.event_id = guest.event_id AND link.id = guest.link_id
    WHERE guest.token_hash=$1 AND guest.event_id=$2 AND guest.expires_at > now()
      AND link.expires_at > now() AND link.revoked_at IS NULL
  `, [digest, eventId])
  return result.rowCount ? digest : null
}

export async function exchangeLink(eventId: string, link: string) {
  if (!uuid.test(eventId) || !tokenFormat.test(link)) return null
  const token = randomBytes(32).toString('base64url')
  const result = await database().query(`
    INSERT INTO wedding.guest_grants (token_hash,event_id,link_id,expires_at)
    SELECT $1,event_id,id,least(expires_at, now() + interval '24 hours')
    FROM wedding.guest_links
    WHERE event_id=$2 AND token_hash=$3 AND expires_at > now() AND revoked_at IS NULL
  `, [hashToken(token), eventId, hashToken(link)])
  return result.rowCount ? token : null
}

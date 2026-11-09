import { createHash, randomBytes } from 'node:crypto'
import { database } from './db'
import { openTotp, verifyPassword, verifyTotp } from './admin-crypto.mjs'

export const adminCookie = '__Host-wedding_admin'
const dummyHash = `${'0'.repeat(32)}:${'0'.repeat(128)}`

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function adminToken(request: Request) {
  const prefix = `${adminCookie}=`
  const token = request.headers.get('cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(prefix))?.slice(prefix.length)
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null
}

export function sessionCookie(token: string, maxAge: number) {
  return `${adminCookie}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
}

export async function signIn(email: string, password: string, code: string) {
  const key = process.env.WEDDING_ADMIN_MFA_KEY
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error('MFA configuration is unavailable')

  const db = database()
  const globalLimit = await db.query(`
    INSERT INTO wedding.admin_login_limits AS limits VALUES ('global', now() + interval '1 minute', 1)
    ON CONFLICT (bucket) DO UPDATE SET
      attempts = CASE WHEN limits.expires_at <= now() THEN 1 ELSE limits.attempts + 1 END,
      expires_at = CASE WHEN limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE limits.expires_at END
    WHERE limits.expires_at <= now() OR limits.attempts < 120
    RETURNING attempts
  `)
  if (!globalLimit.rowCount) return { status: 'limited' } as const

  const limit = await db.query<{ attempts: number }>(`
    INSERT INTO wedding.admin_login_limits AS limits (bucket, expires_at, attempts)
    VALUES ($1, now() + interval '10 minutes', 1)
    ON CONFLICT (bucket) DO UPDATE SET
      attempts = CASE WHEN limits.expires_at <= now() THEN 1 ELSE limits.attempts + 1 END,
      expires_at = CASE WHEN limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE limits.expires_at END
    WHERE limits.expires_at <= now() OR limits.attempts < 8
    RETURNING attempts
  `, [hashToken(email)])
  if (!limit.rowCount) return { status: 'limited' } as const

  const { rows: [account] } = await db.query<{
    id: string; password_hash: string; totp_encrypted: string | null
  }>('SELECT * FROM wedding.admin_login_account($1)', [email])
  const valid = await verifyPassword(password, account?.password_hash ?? dummyHash)
  if (!valid || !account?.totp_encrypted) return { status: 'denied' } as const
  const secret = openTotp(account.totp_encrypted, Buffer.from(key, 'hex'), account.id)
  const step = verifyTotp(secret, code)
  if (step === null) return { status: 'denied' } as const

  const token = randomBytes(32).toString('base64url')
  const { rows: [result] } = await db.query<{ created: boolean }>(
    'SELECT wedding.start_admin_session($1,$2,$3,$4,$5) AS created',
    [account.id, account.password_hash, account.totp_encrypted, step, hashToken(token)],
  )
  return result.created ? { status: 'ok', token } as const : { status: 'denied' } as const
}

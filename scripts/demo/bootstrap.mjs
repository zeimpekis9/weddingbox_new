import { createHash, randomBytes } from 'node:crypto'
import { hashPassword, sealTotp, verifyPassword, verifyTotp } from '../../src/lib/server/admin-crypto.mjs'

export const eventId = '3a98e8f6-2276-4b01-b2fd-918dce52a5ef'
export const ownerId = '96d9e515-07aa-42ad-a907-1aeb1cb01b56'
export const ownerEmail = 'admin@demo.invalid'
export const demoSlug = 'demo-wedding'
export const digest = value => createHash('sha256').update(value).digest('hex')

export function base32(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...bytes].map(byte => byte.toString(2).padStart(8, '0')).join('')
  return (bits.match(/.{1,5}/g) ?? []).map(part => alphabet[parseInt(part.padEnd(5, '0'), 2)]).join('')
}

export async function authorizeBootstrap(enabled, pendingHash, username, password) {
  if (!enabled || !pendingHash || username !== 'admin' || !await verifyPassword(password, pendingHash)) {
    throw new Error('Local bootstrap login denied')
  }
}

export function assertReplacement(password) {
  const length = Array.from(password).length
  if (length < 6 || length > 24) {
    throw new Error('Use 6–24 characters')
  }
}

export async function bootstrapOwner(db, key, prompt, showSecret) {
  const { rows: [{ name }] } = await db.query('SELECT current_database() AS name')
  if (!/^wedding_demo(?:_test_[a-f0-9]{12})?$/.test(name)) throw new Error('This is not a demo database')
  await db.query(`CREATE TABLE IF NOT EXISTS wedding_demo_bootstrap (
    slot boolean PRIMARY KEY DEFAULT true CHECK (slot),
    pending_hash text
  )`)
  await db.query('BEGIN')
  try {
    await db.query('SELECT pg_advisory_xact_lock(510794261)')
    await db.query('INSERT INTO wedding_demo_bootstrap(pending_hash) VALUES ($1) ON CONFLICT DO NOTHING',
      [await hashPassword('admin')])
    const { rows: [{ pending_hash: pending }] } = await db.query('SELECT pending_hash FROM wedding_demo_bootstrap')
    if (pending) {
      await authorizeBootstrap(true, pending, await prompt('Bootstrap username'), await prompt('Bootstrap password', true))
      const password = await prompt('Replacement password', true)
      assertReplacement(password)
      if (password !== await prompt('Confirm replacement password', true)) throw new Error('Passwords differ')
      const secret = randomBytes(20)
      showSecret(base32(secret))
      if (verifyTotp(secret, await prompt('Authenticator code', true)) === null) throw new Error('Invalid MFA code')
      await db.query('DELETE FROM wedding.admin_sessions WHERE user_id=$1', [ownerId])
      await db.query('INSERT INTO wedding.users(id,email,password_hash,totp_encrypted) VALUES ($1,$2,$3,$4)',
        [ownerId, ownerEmail, await hashPassword(password), sealTotp(secret, key, ownerId)])
      await db.query(`INSERT INTO wedding.event_members(event_id,user_id,role)
        SELECT id,$2,'owner' FROM wedding.events WHERE id=$1`, [eventId, ownerId])
      await db.query('UPDATE wedding_demo_bootstrap SET pending_hash=NULL')
    }
    await db.query('COMMIT')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}

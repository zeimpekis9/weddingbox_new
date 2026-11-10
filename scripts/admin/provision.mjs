import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { hashPassword, sealTotp } from '../../src/lib/server/admin-crypto.mjs'

function decodeSecret(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  if (typeof value !== 'string' || !/^[A-Z2-7]{32}$/.test(value)) throw new Error('Invalid TOTP secret')
  const binary = [...value].map(character => alphabet.indexOf(character).toString(2).padStart(5, '0')).join('')
  return Buffer.from(binary.match(/.{8}/g).map(byte => parseInt(byte, 2)))
}

async function main() {
  const url = process.env.WEDDING_PROVISION_DATABASE_URL
  const key = process.env.WEDDING_ADMIN_MFA_KEY
  if (!url || !key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error('Missing provisioning configuration')
  const { email, password, secret, eventId, event, role = 'owner' } = JSON.parse(readFileSync(0, 'utf8'))
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)
      || typeof password !== 'string' || password.length < 16 || password.length > 256
      || !['owner', 'moderator'].includes(role)) throw new Error('Invalid account details')
  if (eventId && event) throw new Error('Choose an existing event or create a new event')
  if (eventId && (typeof eventId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(eventId))) {
    throw new Error('Invalid event identifier')
  }
  if (!eventId && (role !== 'owner' || typeof event?.title !== 'string' || !event.title.trim() ||
      event.title.length > 120 || typeof event.slug !== 'string' || event.slug.length > 80 ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(event.slug))) throw new Error('Invalid event details')
  const target = eventId || randomUUID()
  const accountId = randomUUID()
  const encrypted = sealTotp(decodeSecret(secret), Buffer.from(key, 'hex'), accountId)
  const passwordHash = await hashPassword(password)
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query(`
      WITH new_event AS (
        INSERT INTO wedding.events (id,slug,title)
        SELECT $5,$7,$8 WHERE $7::text IS NOT NULL
        RETURNING id
      ), account AS (
        INSERT INTO wedding.users (id, email, password_hash, totp_encrypted)
        VALUES ($1, $2, $3, $4) RETURNING id
      )
      INSERT INTO wedding.event_members (event_id, user_id, role)
      SELECT COALESCE((SELECT id FROM new_event),$5), id, $6 FROM account
    `, [accountId, email.toLowerCase(), passwordHash, encrypted, target, role,
      eventId ? null : event.slug, eventId ? null : event.title.trim()])
    console.log(`Admin membership provisioned for event ${target}.`)
  } finally {
    await client.end()
  }
}

main().catch(() => {
  console.error('Provisioning failed. Check the input, target event and database configuration.')
  process.exitCode = 1
})

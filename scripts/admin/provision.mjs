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
  const { email, password, secret, eventId, role = 'owner' } = JSON.parse(readFileSync(0, 'utf8'))
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)
      || typeof password !== 'string' || password.length < 16 || password.length > 256
      || !['owner', 'moderator'].includes(role)) throw new Error('Invalid account details')
  const accountId = randomUUID()
  const encrypted = sealTotp(decodeSecret(secret), Buffer.from(key, 'hex'), accountId)
  const passwordHash = await hashPassword(password)
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query(`
      WITH account AS (
        INSERT INTO wedding.users (id, email, password_hash, totp_encrypted)
        VALUES ($1, $2, $3, $4) RETURNING id
      )
      INSERT INTO wedding.event_members (event_id, user_id, role)
      SELECT $5, id, $6 FROM account
    `, [accountId, email.toLowerCase(), passwordHash, encrypted, eventId, role])
    console.log('Admin membership provisioned.')
  } finally {
    await client.end()
  }
}

main().catch(() => {
  console.error('Provisioning failed. Check the input, target event and database configuration.')
  process.exitCode = 1
})

import {
  createCipheriv, createDecipheriv, createHmac, randomBytes, scrypt, timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt)
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
const digest = /^[a-f0-9]{128}$/
const saltFormat = /^[a-f0-9]{32}$/

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await derive(password, salt, 64, options)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(':')
  if (!saltFormat.test(salt) || !digest.test(expected)) return false
  const actual = await derive(password, Buffer.from(salt, 'hex'), 64, options)
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'))
}

export function sealTotp(secret, key, accountId) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(accountId))
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

export function openTotp(sealed, key, accountId) {
  const bytes = Buffer.from(sealed, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
  decipher.setAAD(Buffer.from(accountId))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()])
}

export function verifyTotp(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null
  const current = Math.floor(now / 30000)
  for (const step of [current, current - 1, current + 1]) {
    const counter = Buffer.alloc(8)
    counter.writeBigUInt64BE(BigInt(step))
    const mac = createHmac('sha1', secret).update(counter).digest()
    const offset = mac[mac.length - 1] & 15
    const expected = String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step
  }
  return null
}

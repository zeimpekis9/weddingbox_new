import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, verifyPassword, sealTotp, openTotp, verifyTotp } from '../src/lib/server/admin-crypto.mjs'

test('stores salted password hashes and rejects malformed hashes', async () => {
  const password = 'fixture-password'
  const hash = await hashPassword(password)
  assert.notEqual(hash, await hashPassword(password))
  assert.equal(await verifyPassword(password, hash), true)
  assert.equal(await verifyPassword('wrong', hash), false)
  assert.equal(await verifyPassword(password, 'invalid'), false)
})

test('authenticator codes match RFC 6238 and encrypted secrets are account-bound', () => {
  const secret = Buffer.from('12345678901234567890')
  const key = Buffer.alloc(32, 12)
  const sealed = sealTotp(secret, key, 'account-a')
  assert.deepEqual(openTotp(sealed, key, 'account-a'), secret)
  assert.throws(() => openTotp(sealed, key, 'account-b'))
  assert.equal(verifyTotp(secret, '287082', 59000), 1)
  assert.equal(verifyTotp(secret, '000000', 59000), null)
})

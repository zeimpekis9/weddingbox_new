import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeBootstrap, assertReplacement, base32 } from '../scripts/demo/bootstrap.mjs'
import { hashPassword } from '../src/lib/server/admin-crypto.mjs'

test('bootstrap requires the local opt-in, pending state and a valid password', async () => {
  const pending = await hashPassword('admin')
  await assert.rejects(authorizeBootstrap(false, pending, 'admin', 'admin'))
  await assert.rejects(authorizeBootstrap(true, null, 'admin', 'admin'))
  await assert.rejects(authorizeBootstrap(true, pending, 'owner', 'admin'))
  await assert.rejects(authorizeBootstrap(true, pending, 'admin', 'wrong'))
  await authorizeBootstrap(true, pending, 'admin', 'admin')
})

test('replacement password and standard authenticator encoding', () => {
  for (const password of ['admin', 'a'.repeat(25), '🎉'.repeat(25)]) {
    assert.throws(() => assertReplacement(password))
  }
  for (const password of ['simple', 'a'.repeat(24), '🎉'.repeat(24)]) {
    assert.doesNotThrow(() => assertReplacement(password))
  }
  assert.equal(base32(Buffer.from('foobar')), 'MZXW6YTBOI')
})

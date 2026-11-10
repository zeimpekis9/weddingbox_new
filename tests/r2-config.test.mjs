import assert from 'node:assert/strict'
import test from 'node:test'
import { readR2Config } from '../src/lib/server/r2-config.ts'

const env = {
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_BUCKET: 'wedding-staging',
  R2_JURISDICTION: 'eu',
  R2_ACCESS_KEY_ID: 'fixture-access-key',
  R2_SECRET_ACCESS_KEY: 'fixture-secret',
}

test('uses the jurisdiction-specific S3 endpoint', () => {
  const config = readR2Config(env)
  assert.equal(config.endpoint, `https://${env.R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`)
  assert.equal(config.region, 'auto')
  assert.equal(config.bucket, env.R2_BUCKET)
  assert.equal(config.credentials.secretAccessKey, env.R2_SECRET_ACCESS_KEY)
})

test('absent settings leave the inactive integration disabled', () => {
  assert.equal(readR2Config({ R2_ACCOUNT_ID: '', R2_BUCKET: '' }), null)
})

test('normalizes uppercase account IDs for the DNS endpoint', () => {
  const accountId = 'A'.repeat(32)
  const config = readR2Config({ ...env, R2_ACCOUNT_ID: accountId })
  assert.equal(config.endpoint, `https://${accountId.toLowerCase()}.eu.r2.cloudflarestorage.com`)
})

test('rejects partial or invalid config without echoing values', () => {
  for (const overrides of [
    { R2_SECRET_ACCESS_KEY: '' },
    { R2_JURISDICTION: '' },
    { R2_JURISDICTION: 'invalid-fixture' },
    { R2_ACCOUNT_ID: 'https://invalid-fixture' },
    { R2_BUCKET: 'invalid-fixture/' },
  ]) {
    assert.throws(() => readR2Config({ ...env, ...overrides }), error => {
      assert.doesNotMatch(error.message, /fixture/)
      return true
    })
  }
})

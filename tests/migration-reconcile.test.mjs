import assert from 'node:assert/strict'
import test from 'node:test'
import { hashManifestBytes, reconcile } from '../scripts/migration/reconcile.mjs'

const eventId = '10000000-0000-0000-0000-000000000001'
const other = '10000000-0000-0000-0000-000000000002'
const id = '20000000-0000-0000-0000-000000000001'
const object = Buffer.from([255,216,255,219,0,0])
const metadata = Buffer.from(JSON.stringify({ guestName: 'Μαρία', approved: true }))
const record = { id, eventId, type: 'photo', bytes: object.length,
  originalSha256: hashManifestBytes(object), metadataSha256: hashManifestBytes(metadata) }
const source = { events: [eventId,other], records: [record] }
const target = { events: [eventId,other], records: [{ ...record, key: `events/${eventId}/originals/${id}` }] }

test('reconciliation preserves identity, metadata and original hashes', () => {
  assert.equal(reconcile(source, target).matched, true)
  const altered = { ...target, records: [{ ...target.records[0], bytes: 10, metadataSha256: '0'.repeat(64) }] }
  const result = reconcile(source, altered)
  assert.equal(result.matched, false)
  assert.equal(result.metadataMismatches, 1)
  assert.equal(result.originalMismatches, 1)
  assert.equal(reconcile(source, { ...target, records: [] }).missing, 1)
})

test('reconciliation rejects cross-event object keys and duplicate records', () => {
  assert.throws(() => reconcile(source, { ...target, records: [{ ...record, key: `events/${other}/originals/${id}` }] }),
    /Invalid original inventory/)
  assert.throws(() => reconcile(source, { ...target, records: [...target.records,...target.records] }), /Duplicate record/)
})

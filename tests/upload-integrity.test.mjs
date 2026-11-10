import assert from 'node:assert/strict'
import test from 'node:test'
import { completeParts, contentMatches, partSize, verifiedHead, verifyOriginal } from '../src/lib/server/upload-integrity.mjs'

test('rejects absent, foreign, or truncated durable objects', () => {
  const head = { ETag: '"provider-tag"', ContentLength: 100, Metadata: { 'upload-id': 'one' } }
  assert.equal(verifiedHead(null, 'one', 100), false)
  assert.equal(verifiedHead(head, 'two', 100), false)
  assert.equal(verifiedHead(head, 'one', 101), false)
  assert.equal(verifiedHead(head, 'one', 100), true)
})

test('checks complete multipart inventory from storage', () => {
  const first = { PartNumber: 1, Size: partSize, ETag: 'first' }
  const last = { PartNumber: 2, Size: 75, ETag: 'last' }
  assert.deepEqual(completeParts([last, first], partSize + 75), [first, last])
  assert.equal(completeParts([first, first], partSize + 75), null)
  assert.equal(completeParts([first, { ...last, Size: 74 }], partSize + 75), null)
})

test('checks content signatures independently of the reported MIME', async () => {
  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xdb, 0, 0)
  assert.equal(await contentMatches(jpeg, 'image/jpeg'), true)
  assert.equal(await contentMatches(jpeg, 'video/mp4'), false)
  assert.equal(await contentMatches(Buffer.from('<svg>'), 'image/png'), false)
})

test('accepts audio-only WebM and rejects video or truncated tracks as voice', async () => {
  // WebM DocType, unknown-length Segment, and Tracks with one TrackEntry and TrackType.
  const audio = Buffer.from('1a45dfa3874282847765626d18538067ff1654ae6b85ae83838102', 'hex')
  const video = Buffer.from(audio)
  video[video.length - 1] = 1
  assert.equal(await contentMatches(audio, 'audio/webm'), true)
  assert.equal(await contentMatches(video, 'audio/webm'), false)
  assert.equal(await contentMatches(audio.subarray(0, -1), 'audio/webm'), false)
  const mixed = Buffer.from('1a45dfa3874282847765626d18538067ff1654ae6b8aae83838102ae83838101', 'hex')
  assert.equal(await contentMatches(mixed, 'audio/webm'), false)
})

test('only confirms the original after HEAD, including after a lost copy response', async () => {
  const fixture = { id: 'one', bytes: 6, contentType: 'image/jpeg', stage: 'stage', original: 'original' }
  const staged = { ETag: '"etag"', ContentLength: 6, ContentType: 'image/jpeg' }
  const head = { ...staged, Metadata: { 'upload-id': 'one' } }
  const objects = new Map([['stage', staged]])
  let copies = 0
  const store = {
    head: async key => objects.get(key),
    sniff: async () => Uint8Array.of(0xff, 0xd8, 0xff, 0xdb, 0, 0),
    copy: async () => { copies++ },
  }
  assert.equal(await verifyOriginal(store, fixture), 'incomplete')
  store.copy = async (source, target, etag, id, type) => {
    assert.deepEqual([source, target, etag, id, type], ['stage', 'original', staged.ETag, fixture.id, fixture.contentType])
    copies++
    objects.set('original', head)
    throw new Error('response lost')
  }
  await assert.rejects(verifyOriginal(store, fixture), /response lost/)
  assert.equal(await verifyOriginal(store, fixture), 'verified')
  assert.equal(copies, 2)
})

test('recovers a completed multipart upload after the completion acknowledgement is lost', async () => {
  const fixture = { id: 'multi', bytes: partSize + 1, contentType: 'image/jpeg',
    stage: 'stage', original: 'original', providerId: 'provider' }
  const head = { ETag: '"etag"', ContentLength: fixture.bytes, ContentType: fixture.contentType, Metadata: { 'upload-id': fixture.id } }
  const objects = new Map()
  const parts = [{ PartNumber: 1, Size: partSize, ETag: 'first' }, { PartNumber: 2, Size: 1, ETag: 'last' }]
  let completions = 0
  const store = {
    head: async key => objects.get(key),
    parts: async () => parts,
    complete: async (key, id, submitted) => {
      assert.equal(id, fixture.providerId)
      assert.deepEqual(submitted, parts)
      completions++
      objects.set(key, head)
      throw new Error('completion response lost')
    },
    sniff: async () => Uint8Array.of(0xff, 0xd8, 0xff, 0xdb, 0, 0),
    copy: async (source, target, etag) => {
      assert.equal(etag, head.ETag)
      objects.set(target, objects.get(source))
    },
  }
  await assert.rejects(verifyOriginal(store, fixture), /completion response lost/)
  assert.equal(await verifyOriginal(store, fixture), 'verified')
  assert.equal(completions, 1)
})

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const digest = /^[a-f0-9]{64}$/
const types = new Set(['photo','video','message','voice','cover'])

function index(manifest, target) {
  if (!manifest || !Array.isArray(manifest.events) || !Array.isArray(manifest.records)) {
    throw new Error('Invalid manifest format')
  }
  const events = new Set()
  for (const id of manifest.events) {
    if (typeof id !== 'string' || !uuid.test(id) || events.has(id)) throw new Error('Invalid or duplicate event')
    events.add(id)
  }
  const entries = new Map()
  for (const record of manifest.records) {
    const { id, eventId, type, metadataSha256, originalSha256, bytes, key } = record
    if (typeof id !== 'string' || !uuid.test(id) || !events.has(eventId) || !types.has(type) ||
      typeof metadataSha256 !== 'string' || !digest.test(metadataSha256)) {
      throw new Error('Invalid record or event association')
    }
    if (type === 'message') {
      if (originalSha256 != null || bytes != null || key != null) throw new Error('Unexpected message attachment')
    } else if (typeof originalSha256 !== 'string' || !digest.test(originalSha256) || !Number.isSafeInteger(bytes) || bytes < 1 ||
      (target && key !== `events/${eventId}/originals/${id}`)) {
      throw new Error('Invalid original inventory')
    }
    const identity = `${eventId}/${type}/${id}`
    if (entries.has(identity)) throw new Error('Duplicate record')
    entries.set(identity, record)
  }
  return { events, entries }
}

export function reconcile(source, target) {
  const left = index(source, false)
  const right = index(target, true)
  const summary = { events: left.events.size, records: left.entries.size, eventMismatches: 0,
    missing: 0, extra: 0, metadataMismatches: 0, originalMismatches: 0 }
  for (const id of left.events) if (!right.events.has(id)) summary.eventMismatches++
  for (const id of right.events) if (!left.events.has(id)) summary.eventMismatches++
  for (const [identity, expected] of left.entries) {
    const actual = right.entries.get(identity)
    if (!actual) { summary.missing++; continue }
    if (expected.metadataSha256 !== actual.metadataSha256) summary.metadataMismatches++
    if (expected.originalSha256 !== actual.originalSha256 || expected.bytes !== actual.bytes) summary.originalMismatches++
  }
  for (const identity of right.entries.keys()) if (!left.entries.has(identity)) summary.extra++
  const { events, records, ...mismatches } = summary
  return { ...summary, matched: Object.values(mismatches).every(count => count === 0) }
}

export function hashManifestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [source, target] = process.argv.slice(2)
    if (!source || !target) throw new Error('Supply source and target manifest paths')
    const result = reconcile(JSON.parse(readFileSync(source, 'utf8')), JSON.parse(readFileSync(target, 'utf8')))
    console.log(JSON.stringify(result))
    if (!result.matched) process.exitCode = 1
  } catch {
    console.error('Manifest reconciliation failed. Check format and event associations privately.')
    process.exitCode = 1
  }
}

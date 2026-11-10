import { randomUUID } from 'node:crypto'
import { database } from './db'
import { r2 } from './r2'
import { multipartThreshold, partSize, verifyOriginal } from './upload-integrity.mjs'

const mediaTypes = new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif',
  'video/mp4','video/quicktime','audio/webm','audio/mp4','audio/mpeg'])
type Upload = {
  id: string; event_id: string; grant_hash: string; filename: string; content_type: string
  byte_size: string; provider_id: string | null; state: string; active: boolean
}
type RequestFile = { filename: string; type: string; bytes: number; requestId: string }

export function acceptedFile(file: RequestFile) {
  const limit = file.type.startsWith('video/') ? 500 : file.type.startsWith('audio/') ? 12 : 25
  return mediaTypes.has(file.type) && Number.isSafeInteger(file.bytes) &&
    file.bytes > 0 && file.bytes <= limit * 1024 * 1024 &&
    file.filename.length > 0 && file.filename.length <= 180 && !/[\x00-\x1f\x7f/\\]/.test(file.filename)
}

const stageKey = (upload: Upload) => `events/${upload.event_id}/staging/${upload.id}`
const originalKey = (upload: Upload) => `events/${upload.event_id}/originals/${upload.id}`
const isMultipart = (upload: Upload) => Number(upload.byte_size) >= multipartThreshold

export async function findUpload(event: string, grant: string, id: string) {
  const { rows: [upload] } = await database().query<Upload>(`
    SELECT *,expires_at > now() AS active FROM wedding.upload_sessions
    WHERE event_id=$1 AND grant_hash=$2 AND id=$3
  `, [event, grant, id])
  return upload
}

export async function initialize(event: string, grant: string, file: RequestFile) {
  const client = await database().connect()
  let committed = false
  try {
    await client.query('BEGIN')
    await client.query('SELECT 1 FROM wedding.guest_grants WHERE event_id=$1 AND token_hash=$2 FOR UPDATE', [event, grant])
    let { rows: [upload] } = await client.query<Upload>(`
      SELECT *,expires_at > now() AS active FROM wedding.upload_sessions
      WHERE event_id=$1 AND grant_hash=$2 AND request_id=$3
    `, [event, grant, file.requestId])
    if (upload) {
      if (Number(upload.byte_size) !== file.bytes || upload.filename !== file.filename ||
          upload.content_type !== file.type) return { error: 'Conflicting upload request', status: 409 } as const
    } else {
      const quota = await client.query<{ count: number; bytes: string }>(`
        SELECT count(*)::int AS count,COALESCE(sum(byte_size),0) AS bytes FROM wedding.upload_sessions
        WHERE event_id=$1 AND grant_hash=$2 AND state IN ('pending','uploaded') AND expires_at > now()
      `, [event, grant])
      if (quota.rows[0].count >= 100 || Number(quota.rows[0].bytes) + file.bytes > 2 * 1024 ** 3) {
        return { error: 'Upload limit reached', status: 429 } as const
      }
      const result = await client.query<Upload>(`
        INSERT INTO wedding.upload_sessions (event_id,grant_hash,request_id,filename,content_type,byte_size)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *, true AS active
      `, [event, grant, file.requestId, file.filename, file.type, file.bytes])
      upload = result.rows[0]
    }
    await client.query('COMMIT')
    committed = true
    return { upload } as const
  } finally {
    try {
      if (!committed) await client.query('ROLLBACK')
      client.release()
    } catch {
      client.release(true)
    }
  }
}

async function claim(upload: Upload) {
  const lease = randomUUID()
  const result = await database().query(`
    UPDATE wedding.upload_sessions SET lease_id=$2,lease_until=now()+interval '90 seconds'
    WHERE id=$1 AND state='pending' AND expires_at > now() AND (lease_until IS NULL OR lease_until < now())
  `, [upload.id, lease])
  return result.rowCount ? lease : null
}

async function release(upload: Upload, lease: string) {
  await database().query(`
    UPDATE wedding.upload_sessions SET lease_id=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2
  `, [upload.id, lease])
}

export async function uploadInstructions(upload: Upload) {
  if (upload.state !== 'pending' || !upload.active) return { id: upload.id, state: upload.state, active: upload.active }
  const storage = r2()
  if (!isMultipart(upload)) {
    return { id: upload.id, state: 'pending', mode: 'single',
      url: await storage.signSingle(stageKey(upload), upload.content_type),
      headers: { 'Content-Type': upload.content_type, 'If-None-Match': '*' } }
  }
  if (!upload.provider_id) {
    const lease = await claim(upload)
    if (!lease) return { id: upload.id, state: 'pending', mode: 'initializing' }
    try {
      const id = await storage.create(stageKey(upload), upload.content_type, upload.id)
      const result = await database().query('UPDATE wedding.upload_sessions SET provider_id=$3 WHERE id=$1 AND lease_id=$2',
        [upload.id, lease, id])
      if (!result.rowCount) await storage.abort(stageKey(upload), id)
    } finally {
      await release(upload, lease)
    }
  }
  return { id: upload.id, state: 'pending', mode: 'multipart', partSize }
}

export async function uploadPart(upload: Upload, part: number) {
  if (!upload.active || upload.state !== 'pending' || !upload.provider_id ||
      !Number.isInteger(part) || part < 1 || part > Math.ceil(Number(upload.byte_size) / partSize)) return null
  return r2().signPart(stageKey(upload), upload.provider_id, part)
}

export async function uploadStatus(upload: Upload) {
  const status = { id: upload.id, state: upload.state, active: upload.active }
  if (!upload.active || upload.state !== 'pending') return status
  const storage = r2()
  if (await storage.head(stageKey(upload))) return { ...status, staged: true }
  const bytes = Number(upload.byte_size)
  const parts = upload.provider_id ? await storage.parts(stageKey(upload), upload.provider_id) : []
  const receivedParts = parts.filter(part => {
    const index = (part.PartNumber ?? 0) - 1
    return index >= 0 && index * partSize < bytes && part.ETag &&
      part.Size === Math.min(partSize, bytes - index * partSize)
  }).map(part => part.PartNumber)
  return { ...status, staged: false, receivedParts }
}

export async function cancelUpload(upload: Upload) {
  const result = await database().query(`
    UPDATE wedding.upload_sessions SET state='cancelled'
    WHERE id=$1 AND state='pending' AND (lease_until IS NULL OR lease_until < now())
  `, [upload.id])
  if (result.rowCount && upload.provider_id) {
    await r2().abort(stageKey(upload), upload.provider_id).catch(() => undefined)
  }
  return Boolean(result.rowCount || upload.state === 'cancelled')
}

export async function finalizeUpload(upload: Upload) {
  if (upload.state === 'uploaded') return 'uploaded'
  if (!upload.active || upload.state !== 'pending') return 'closed'
  const lease = await claim(upload)
  if (!lease) return 'busy'
  try {
    const original = originalKey(upload)
    const resultState = await verifyOriginal(r2(), {
      id: upload.id, bytes: Number(upload.byte_size), contentType: upload.content_type,
      stage: stageKey(upload), original, providerId: upload.provider_id,
    })
    if (resultState === 'invalid') {
      await database().query("UPDATE wedding.upload_sessions SET state='failed' WHERE id=$1 AND lease_id=$2",
        [upload.id, lease])
    }
    if (resultState !== 'verified') return resultState
    const result = await database().query(`
      WITH verified AS (
        UPDATE wedding.upload_sessions SET state='uploaded'
        WHERE id=$1 AND lease_id=$2 AND lease_until > now() AND state='pending'
        RETURNING id,event_id,filename,content_type,byte_size
      )
      INSERT INTO wedding.media (id,event_id,filename,content_type,byte_size,object_key)
      SELECT id,event_id,filename,content_type,byte_size,$3 FROM verified
    `, [upload.id, lease, original])
    return result.rowCount ? 'uploaded' : 'busy'
  } finally {
    await release(upload, lease)
  }
}

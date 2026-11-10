import { createReadStream } from 'node:fs'
import { mkdtemp, rm, rmdir, statfs } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import pg from 'pg'
import sharp from 'sharp'
import { readR2Config } from '../../src/lib/server/r2-config.ts'
import { makeArchive } from './archive.mjs'
import { claimJob } from './queue.mjs'

const config = readR2Config()
const connectionString = process.env.WEDDING_WORKER_DATABASE_URL
if (!connectionString || !config) throw new Error('Worker configuration is incomplete')
const db = new pg.Pool({ connectionString, max: 3, connectionTimeoutMillis: 2500, statement_timeout: 5000 })
db.on('error', () => console.error('Worker database connection failed'))
const store = new S3Client({ ...config, maxAttempts: 2 })
const Bucket = config.bucket
let stopping = false
process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })

async function getObject(key, signal) {
  const response = await store.send(new GetObjectCommand({ Bucket, Key: key }), { abortSignal: signal })
  if (!response.Body) throw new Error('Original is unavailable')
  return response
}

async function thumbnail(job, signal) {
  const { rows: [media] } = await db.query('SELECT object_key,byte_size FROM wedding.media WHERE event_id=$1 AND id=$2',
    [job.event_id, job.media_id])
  if (!media || Number(media.byte_size) > 25 * 1024 ** 2) throw new Error('Image exceeds the preview limit')
  const source = await getObject(media.object_key, signal)
  if (source.ContentLength !== Number(media.byte_size)) {
    source.Body.destroy()
    throw new Error('Image length differs from metadata')
  }
  const image = await source.Body.transformToByteArray()
  const preview = await sharp(image, { limitInputPixels: 40_000_000, failOn: 'error' }).rotate()
    .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
  const key = `events/${job.event_id}/previews/${job.media_id}/${job.lease}.webp`
  await store.send(new PutObjectCommand({ Bucket, Key: key, Body: preview, ContentType: 'image/webp' }), { abortSignal: signal })
  await db.query(`
    WITH ready AS (
      UPDATE wedding.background_jobs SET state='ready', progress=100, lease_until=NULL, object_key=$3
      WHERE id=$1 AND lease=$2 AND lease_until > now() RETURNING event_id,media_id
    )
    UPDATE wedding.media SET thumbnail_key=$3 FROM ready
    WHERE media.event_id=ready.event_id AND media.id=ready.media_id
  `, [job.id, job.lease, key])
}

async function eventArchive(job, signal) {
  const directory = await mkdtemp(join(tmpdir(), 'wedding-export-'))
  try {
    const { rows: [inventory] } = await db.query(`
      SELECT count(*)::int AS count,COALESCE(sum(byte_size),0)::text AS bytes
      FROM wedding.media WHERE event_id=$1
    `, [job.event_id])
    const max = 20 * 1024 ** 3
    const disk = await statfs(directory)
    if (inventory.count > 10000 || Number(inventory.bytes) > max ||
        Number(inventory.bytes) + 512 * 1024 ** 2 > disk.bavail * disk.bsize) throw new Error('Export exceeds local capacity')
    const [media, messages] = await Promise.all([
      db.query('SELECT id,object_key,filename,byte_size FROM wedding.media WHERE event_id=$1 ORDER BY id LIMIT 10001',
        [job.event_id]),
      db.query(`SELECT id,message_text,guest_name,created_at,moderation FROM wedding.submissions
        WHERE event_id=$1 AND type='message' AND deleted_at IS NULL ORDER BY created_at,id LIMIT 10001`,
        [job.event_id]),
    ])
    if (media.rowCount > 10000 || messages.rowCount > 10000 ||
        media.rows.reduce((total, item) => total + Number(item.byte_size), 0) > max) throw new Error('Export exceeds local capacity')
    const path = join(directory, 'event.zip')
    const result = await makeArchive(path, media.rows, messages.rows, async key => (await getObject(key, signal)).Body,
      async count => {
        signal.throwIfAborted()
        if (count % 10 === 0) await db.query('UPDATE wedding.background_jobs SET progress=$3 WHERE id=$1 AND lease=$2',
          [job.id, job.lease, Math.floor(90 * count / media.rowCount)])
      })
    const key = `events/${job.event_id}/exports/${job.id}/${job.lease}.zip`
    const transfer = new Upload({ client: store, queueSize: 2, partSize: 8 * 1024 ** 2,
      params: { Bucket, Key: key, Body: createReadStream(path), ContentLength: result.bytes,
        ContentType: 'application/zip', Metadata: { sha256: result.sha256 } } })
    const abort = () => { void transfer.abort().catch(() => {}) }
    signal.addEventListener('abort', abort, { once: true })
    try {
      signal.throwIfAborted()
      await transfer.done()
    } finally {
      signal.removeEventListener('abort', abort)
    }
    const head = await store.send(new HeadObjectCommand({ Bucket, Key: key }), { abortSignal: signal })
    if (head.ContentLength !== result.bytes || head.Metadata?.sha256 !== result.sha256) throw new Error('Archive could not be verified')
    await db.query(`
      UPDATE wedding.background_jobs SET state='ready',progress=100,object_key=$3,sha256=$4,
        item_count=$5,expires_at=now()+interval '24 hours',lease_until=NULL
      WHERE id=$1 AND lease=$2 AND lease_until > now()
    `, [job.id, job.lease, key, result.sha256, result.count])
  } finally {
    await rm(join(directory, 'event.zip'), { force: true })
    await rmdir(directory)
  }
}

try {
  while (!stopping) {
    const job = await claimJob(db, process.env.WEDDING_UPLOAD_ONLY === '1')
    if (!job) { await sleep(1000); continue }
    const lost = new AbortController()
    const signal = AbortSignal.any([lost.signal, AbortSignal.timeout(15 * 60 * 1000)])
    const renewal = setInterval(() => {
      db.query(`UPDATE wedding.background_jobs SET lease_until=now()+interval '90 seconds'
        WHERE id=$1 AND lease=$2 AND state='running' AND lease_until > now()`, [job.id,job.lease])
        .then(result => { if (!result.rowCount) lost.abort() }).catch(() => lost.abort())
    }, 20000)
    try {
      if (job.attempts > 5) throw new Error('Job exhausted')
      await (job.kind === 'thumbnail' ? thumbnail(job, signal) : eventArchive(job, signal))
    } catch {
      await db.query(`UPDATE wedding.background_jobs
        SET state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'queued' END,
          run_at=now()+interval '15 seconds'*attempts,lease=NULL,lease_until=NULL
        WHERE id=$1 AND lease=$2 AND state='running'`, [job.id,job.lease])
      console.error('Wedding background job failed', job.kind)
    } finally {
      clearInterval(renewal)
    }
  }
} finally {
  await db.end()
  store.destroy()
}

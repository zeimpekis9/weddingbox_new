import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import pg from 'pg'
import sharp from 'sharp'
import test from 'node:test'
import { readR2Config } from '../../src/lib/server/r2-config.ts'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const enabled = process.env.WEDDING_WORKER_TEST === 'local-eu-staging'
const docker = (...args) => execFileSync('docker', [
  'compose', '--env-file', '.env.compose.local', '-f', 'compose.yml', '-p', 'wedding-foundation',
  'exec', '-T', 'db', ...args,
], { windowsHide: true, stdio: 'pipe' })

test('live R2 thumbnail worker recovers after process loss and exports original bytes', { skip: !enabled, timeout: 90_000 }, async () => {
  const config = readR2Config()
  assert.ok(config?.bucket === 'weddingbox-staging' && process.env.R2_JURISDICTION === 'eu',
    'This test requires the disposable EU staging bucket')
  const env = Object.fromEntries(readFileSync('.env.compose.local', 'utf8').split(/\r?\n/)
    .filter(line => /^WEDDING_LOCAL_DB_(PASSWORD|PORT)=/.test(line))
    .map(line => line.split(/=(.*)/s).slice(0, 2)))
  const scratch = `wedding_worker_${randomUUID().replaceAll('-', '')}`
  const event = randomUUID()
  const media = randomUUID()
  const link = randomUUID()
  const grant = randomUUID()
  const object = `events/${event}/originals/${media}`
  const url = new URL(`postgresql://wedding_migrator@127.0.0.1:55432/${scratch}`)
  url.port = env.WEDDING_LOCAL_DB_PORT || '55432'
  url.password = env.WEDDING_LOCAL_DB_PASSWORD
  const workerUrl = new URL(url)
  workerUrl.searchParams.set('options', '-c role=wedding_worker')
  const db = new pg.Client({ connectionString: url.href })
  const lock = new pg.Client({ connectionString: url.href })
  const r2 = new S3Client({ ...config, maxAttempts: 2 })
  const target = Key => ({ Bucket: config.bucket, Key })
  const keys = new Set()
  let child
  let directory
  let created = false
  let connected = false
  let locked = false

  const start = () => {
    child = spawn(process.execPath, ['scripts/worker/run.mjs'], {
      env: { ...process.env, WEDDING_WORKER_DATABASE_URL: workerUrl.href, WEDDING_UPLOAD_ONLY: '0' },
      stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true,
    })
  }
  const stop = async () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    const exit = once(child, 'exit')
    child.kill('SIGKILL')
    await exit
  }
  const waitForJob = async (kind, state) => {
    for (let attempt = 0; attempt < 80; attempt++) {
      const { rows: [job] } = await db.query(
        'SELECT * FROM wedding.background_jobs WHERE event_id=$1 AND kind=$2', [event, kind])
      if (job?.state === state) return job
      if (child.exitCode !== null || child.signalCode !== null) break
      await sleep(250)
    }
    assert.fail(`Worker did not reach ${kind}/${state}`)
  }
  const get = async key => Buffer.from(await (await r2.send(new GetObjectCommand(target(key)))).Body.transformToByteArray())
  try {
    docker('createdb', '-U', 'wedding_migrator', scratch)
    created = true
    docker('sh', '-ec', 'pg_dump --schema-only -U wedding_migrator wedding_dev | psql -X -q -v ON_ERROR_STOP=1 -U wedding_migrator -d "$1"', 'restore-schema', scratch)
    await db.connect()
    connected = true
    await lock.connect()
    locked = true
    const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'pink' } }).jpeg().toBuffer()
    keys.add(object)
    await r2.send(new PutObjectCommand({ ...target(object), Body: jpeg, ContentType: 'image/jpeg', IfNoneMatch: '*' }))
    await db.query("INSERT INTO wedding.events(id,slug,title) VALUES ($1::uuid,$1::text,'Synthetic worker test')", [event])
    await db.query("INSERT INTO wedding.guest_links(id,event_id,token_hash,expires_at) VALUES ($1::uuid,$2,$1::uuid::text,now()+interval '1 hour')", [link, event])
    await db.query("INSERT INTO wedding.guest_grants VALUES ($1,$2,$3,now()+interval '1 hour')", [grant, event, link])
    await db.query("INSERT INTO wedding.upload_sessions(id,event_id,grant_hash,request_id,filename,content_type,byte_size,state) VALUES ($1,$2,$3,$1,'synthetic.jpg','image/jpeg',$4,'uploaded')", [media, event, grant, jpeg.length])
    await db.query("INSERT INTO wedding.media(id,event_id,object_key,filename,content_type,byte_size) VALUES ($1,$2,$3,'synthetic.jpg','image/jpeg',$4)", [media, event, object, jpeg.length])
    await lock.query('BEGIN; LOCK wedding.media IN ACCESS EXCLUSIVE MODE')
    start()
    const interrupted = await waitForJob('thumbnail', 'running')
    keys.add(`events/${event}/previews/${media}/${interrupted.lease}.webp`)
    await stop()
    await lock.query('ROLLBACK')
    await db.query("UPDATE wedding.background_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [interrupted.id])
    start()
    const thumbnail = await waitForJob('thumbnail', 'ready')
    keys.add(thumbnail.object_key)
    assert.equal(thumbnail.attempts, 2)
    assert.notEqual(thumbnail.lease, interrupted.lease)
    assert.equal((await sharp(await get(thumbnail.object_key)).metadata()).format, 'webp')
    assert.equal(sha256(await get(object)), sha256(jpeg))

    await db.query("INSERT INTO wedding.background_jobs(event_id,kind) VALUES ($1,'export')", [event])
    const archive = await waitForJob('export', 'ready')
    keys.add(archive.object_key)
    const bytes = await get(archive.object_key)
    assert.equal(sha256(bytes), archive.sha256)
    directory = await mkdtemp(join(tmpdir(), 'wedding-worker-test-'))
    const path = join(directory, 'event.zip')
    await writeFile(path, bytes)
    const extract = name => execFileSync('tar', ['-xOf', path, name], { windowsHide: true })
    const manifest = JSON.parse(extract('manifest.json'))
    assert.deepEqual(manifest.originals, [{ id: media, path: `originals/${media}/synthetic.jpg`, bytes: jpeg.length, sha256: sha256(jpeg) }])
    assert.deepEqual(extract(manifest.originals[0].path), jpeg)
    assert.equal(sha256(extract('guestbook.json')), manifest.guestbook.sha256)
  } finally {
    await stop()
    try {
      if (connected) {
        const { rows } = await db.query('SELECT id, media_id, kind, lease FROM wedding.background_jobs WHERE event_id=$1 AND lease IS NOT NULL', [event])
        for (const job of rows) {
          keys.add(job.kind === 'thumbnail' ? `events/${event}/previews/${job.media_id}/${job.lease}.webp`
            : `events/${event}/exports/${job.id}/${job.lease}.zip`)
        }
      }
      for (const key of keys) {
        await r2.send(new DeleteObjectCommand(target(key)))
        await assert.rejects(r2.send(new HeadObjectCommand(target(key))), error => error.$metadata?.httpStatusCode === 404)
      }
    } finally {
      r2.destroy()
      if (locked) await lock.end()
      if (connected) await db.end()
      if (created) docker('dropdb', '-U', 'wedding_migrator', scratch)
      if (directory) await rm(join(directory, 'event.zip'), { force: true })
      if (directory) await rmdir(directory)
    }
  }
})

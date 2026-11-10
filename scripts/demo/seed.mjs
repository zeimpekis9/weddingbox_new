import { readFile } from 'node:fs/promises'
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { readR2Config } from '../../src/lib/server/r2-config.ts'
import { demoSlug, digest, eventId, ownerId } from './bootstrap.mjs'

const fixtureLink = 'b9a3ce15-4923-42b4-bf67-2e2a2052fe07'
const fixtureGrant = digest('synthetic demo import only')
const samples = [
  ['25f6d803-a92b-460b-bf7c-2a0499f12cd8', 'demo-ceremony.jpg', 'image/jpeg', 'approved'],
  ['b3db2d61-02c4-415b-9bc1-a4029ed63341', 'demo-video.mp4', 'video/mp4', 'approved'],
  ['66d72927-0361-4710-b4f1-be21f4d1ac7f', 'demo-pending.jpg', 'image/jpeg', 'pending'],
]
const fixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url))

async function storeFixtures(config) {
  const store = new S3Client({ ...config, maxAttempts: 2 })
  async function put(Key, Body, ContentType) {
    const input = { Bucket: config.bucket, Key }
    const sha256 = digest(Body)
    try {
      await store.send(new PutObjectCommand({ ...input, Body, ContentType, IfNoneMatch: '*', Metadata: { sha256 } }))
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 412) throw error
    }
    const head = await store.send(new HeadObjectCommand(input))
    if (head.Metadata?.sha256 !== sha256 || head.ContentLength !== Body.length || head.ContentType !== ContentType) {
      throw new Error('A demo fixture has unexpected storage metadata')
    }
    return Key
  }
  try {
    return await Promise.all(samples.map(async ([id, name, mime, moderation]) => {
      const image = mime === 'image/jpeg'
      const body = await fixture(image ? name : 'sample.mp4')
      const original = await put(`events/${eventId}/originals/${id}`, body, mime)
      const preview = image ? await put(`events/${eventId}/previews/${id}/demo.webp`,
        await fixture(name.replace(/\.jpg$/, '.webp')), 'image/webp') : null
      return { id, name, mime, moderation, original, preview, bytes: body.length }
    }))
  } finally {
    store.destroy()
  }
}

export async function seedDemo(db, invitation) {
  const config = readR2Config()
  if (config?.bucket !== 'weddingbox-staging' || process.env.R2_JURISDICTION !== 'eu') {
    throw new Error('Demo requires the EU weddingbox-staging R2 bucket')
  }
  const media = await storeFixtures(config)
  await db.query('BEGIN')
  try {
    await db.query('SELECT pg_advisory_xact_lock(510794262)')
    await db.query(`INSERT INTO wedding.events(id,slug,title,welcome_message,primary_color)
      VALUES ($1,$2,'Demo Wedding','Synthetic demo only · Δοκιμαστικός γάμος','#79506d')
      ON CONFLICT (id) DO NOTHING`, [eventId, demoSlug])
    await db.query(`INSERT INTO wedding.event_members(event_id,user_id,role)
      SELECT $1,id,'owner' FROM wedding.users WHERE id=$2 ON CONFLICT DO NOTHING`, [eventId, ownerId])
    await db.query('INSERT INTO wedding.event_settings(event_id,guest_gallery_enabled) VALUES ($1,true) ON CONFLICT DO NOTHING', [eventId])
    await db.query(`INSERT INTO wedding.guest_links(event_id,token_hash,expires_at)
      VALUES ($1,$2,now()+interval '7 days')
      ON CONFLICT (token_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at
      WHERE wedding.guest_links.revoked_at IS NULL`, [eventId, digest(invitation)])
    await db.query(`INSERT INTO wedding.guest_links(id,event_id,token_hash,expires_at,revoked_at)
      VALUES ($1,$2,$3,now(),now()) ON CONFLICT DO NOTHING`, [fixtureLink, eventId, digest(fixtureLink)])
    await db.query('INSERT INTO wedding.guest_grants VALUES ($1,$2,$3,now()) ON CONFLICT DO NOTHING',
      [fixtureGrant, eventId, fixtureLink])
    for (const item of media) {
      await db.query(`INSERT INTO wedding.upload_sessions(id,event_id,grant_hash,request_id,filename,content_type,byte_size,state)
        VALUES ($1,$2,$3,$1,$4,$5,$6,'uploaded') ON CONFLICT DO NOTHING`,
      [item.id, eventId, fixtureGrant, item.name, item.mime, item.bytes])
      const inserted = await db.query(`INSERT INTO wedding.media(id,event_id,object_key,filename,content_type,byte_size,moderation,thumbnail_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [item.id, eventId, item.original, item.name, item.mime, item.bytes, item.moderation, item.preview])
      if (inserted.rowCount && item.preview) await db.query(`UPDATE wedding.background_jobs
        SET state='ready',progress=100,object_key=$2 WHERE media_id=$1 AND kind='thumbnail'`, [item.id, item.preview])
    }
    await db.query(`INSERT INTO wedding.submissions(id,event_id,type,message_text,guest_name,moderation)
      VALUES ('c95bf5b3-9be1-4f50-996c-0592068dbf52',$1,'message','Να ζήσετε! · Congratulations!','Demo guest','approved'),
             ('82c527fa-24d0-44bf-99ed-729fd0db6da1',$1,'message','Sample message awaiting review','Demo guest','pending')
      ON CONFLICT (id) DO NOTHING`, [eventId])
    await db.query('COMMIT')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}

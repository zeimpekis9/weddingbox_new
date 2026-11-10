import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import QRCode from 'qrcode'
import { bootstrapOwner, eventId, ownerEmail } from './bootstrap.mjs'
import { seedDemo } from './seed.mjs'

export const demoOrigin = 'http://localhost:3000'
export const inviteOrigin = 'http://localhost:3001'
const statePath = new URL('../../.env.demo.local', import.meta.url)

export async function openDemoDatabase(name = 'wedding_demo') {
  if (!/^wedding_demo(?:_test_[a-f0-9]{12})?$/.test(name)) throw new Error('Invalid demo database name')
  const env = Object.fromEntries(readFileSync('.env.compose.local', 'utf8').split(/\r?\n/)
    .filter(line => /^WEDDING_LOCAL_DB_(PASSWORD|PORT)=/.test(line))
    .map(line => line.split(/=(.*)/s).slice(0, 2)))
  const url = new URL('postgresql://wedding_migrator@127.0.0.1:55432/wedding_dev')
  url.port = env.WEDDING_LOCAL_DB_PORT || '55432'
  url.password = env.WEDDING_LOCAL_DB_PASSWORD
  const source = new pg.Client({ connectionString: url.href })
  await source.connect()
  try {
    await source.query('SELECT pg_advisory_lock(510794260)')
    if (!(await source.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount) {
      await source.query(`CREATE DATABASE ${name}`)
      try {
        execFileSync('docker', ['compose','--env-file','.env.compose.local','-f','compose.yml','-p','wedding-foundation',
          'exec','-T','db','sh','-ec',
          'pg_dump --schema-only -U wedding_migrator wedding_dev | psql -X -q -v ON_ERROR_STOP=1 -U wedding_migrator -d "$1"',
          'restore-demo-schema',name], { stdio: 'pipe', windowsHide: true })
      } catch {
        await source.query(`DROP DATABASE ${name}`)
        throw new Error('Could not install the local demo schema')
      }
    }
  } finally {
    await source.end()
  }
  url.pathname = name
  const db = new pg.Client({ connectionString: url.href })
  await db.connect()
  try {
    await db.query('BEGIN')
    await db.query('SELECT pg_advisory_xact_lock(510794263)')
    const { rows: [{ themes }] } = await db.query("SELECT to_regclass('wedding.event_themes') AS themes")
    if (!themes) await db.query(readFileSync(new URL('../../db/migrations/009_event_themes.sql', import.meta.url), 'utf8'))
    await db.query('COMMIT')
  } catch (error) {
    await db.end()
    throw error
  }
  return { db, url }
}

function localState() {
  try {
    writeFileSync(statePath, JSON.stringify({ key: randomBytes(32).toString('hex'),
      invitation: randomBytes(32).toString('base64url') }), { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  if (!/^[a-f0-9]{64}$/.test(state.key) || !/^[\w-]{43}$/.test(state.invitation)) throw new Error('Invalid local demo state')
  return state
}

export async function serveInvitation(invitation, port = 3001) {
  const target = `${demoOrigin}/join/${eventId}#${invitation}`
  const qr = await QRCode.toDataURL(target)
  const server = createServer((request, response) => {
    const crossSite = request.headers['sec-fetch-site'] === 'cross-site'
    const forwarded = Object.keys(request.headers).some(name => name === 'forwarded' || name.startsWith('x-forwarded-') || name.startsWith('cf-'))
    if (request.method !== 'GET' || request.headers.host !== `localhost:${port}` ||
        request.url !== '/invite' || crossSite || forwarded) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "default-src 'none'; img-src data:; frame-ancestors 'none'; base-uri 'none'",
    })
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
      <title>Demo Wedding QR invitation</title><main><h1>Demo Wedding</h1><p>Synthetic demo · local computer only</p>
      <img width="220" height="220" src="${qr}" alt="Demo guest invitation QR"><p><a href="${target}">Preview guest experience</a></p></main></html>`)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return server
}

function startRuntime(url, key) {
  const api = new URL(url)
  api.searchParams.set('options', '-c role=wedding_api')
  const worker = new URL(url)
  worker.searchParams.set('options', '-c role=wedding_worker')
  const env = { ...process.env, WEDDING_APP_ORIGIN: demoOrigin, WEDDING_DATABASE_URL: api.href,
    WEDDING_WORKER_DATABASE_URL: worker.href, WEDDING_ADMIN_MFA_KEY: key, WEDDING_UPLOAD_ONLY: '0', NEXT_TELEMETRY_DISABLED: '1' }
  const processes = [
    ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3000'],
    ['scripts/worker/run.mjs'],
  ].map(args => spawn(process.execPath, args, { env, stdio: ['ignore','inherit','inherit'], windowsHide: true }))
  return processes
}

async function setup(db, key) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run owner setup in an interactive local terminal')
  let hidden = false
  const output = new Writable({ write(chunk, _encoding, done) {
    if (!hidden) process.stdout.write(chunk)
    done()
  } })
  const rl = createInterface({ input: process.stdin, output, terminal: true })
  try {
    await bootstrapOwner(db, Buffer.from(key, 'hex'), async (label, secret) => {
      hidden = Boolean(secret)
      if (hidden) process.stdout.write(`${label}: `)
      try { return await rl.question(hidden ? '' : `${label}: `) }
      finally {
        if (hidden) process.stdout.write('\n')
        hidden = false
      }
    }, secret => console.log(`Add a time-based entry for ${ownerEmail} to your authenticator. Manual key: ${secret}`))
    console.log(`Owner enrolled. Sign in at ${demoOrigin}/admin with ${ownerEmail}.`)
  } finally {
    rl.close()
  }
}

async function main() {
  const [, , action, flag] = process.argv
  if (!['serve','setup'].includes(action) || flag !== '--local-only' || process.env.NODE_ENV === 'production') {
    throw new Error('Usage: node --env-file=.env.local scripts/demo/local.mjs serve|setup --local-only')
  }
  const state = localState()
  const { db, url } = await openDemoDatabase()
  try {
    if (action === 'setup') return await setup(db, state.key)
    await seedDemo(db, state.invitation)
  } finally {
    await db.end()
  }
  const invite = await serveInvitation(state.invitation)
  const children = startRuntime(url, state.key)
  const stop = () => {
    invite.close()
    children.forEach(child => child.kill())
  }
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, stop)
  for (const child of children) child.once('exit', code => {
    if (code) process.exitCode = code
    stop()
  })
  console.log(`Local invitation: ${inviteOrigin}/invite. Owner setup is a separate local CLI step.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const message = error.code === 'EADDRINUSE' ? 'A demo port is already in use' : 'Local demo failed'
    console.error(message)
    if (process.argv[2] === 'setup' && error.constructor === Error) console.error(error.message)
    process.exitCode = 1
  })
}

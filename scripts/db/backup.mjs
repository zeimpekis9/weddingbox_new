import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, openSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const action = process.argv[2]
const input = process.argv[3]
const compose = ['compose','--env-file','.env.compose.local','-f','compose.yml','-p','wedding-foundation','exec','-T','db']
const role = 'wedding_migrator'
const database = 'wedding_dev'

function command(args, stdio) {
  const result = spawnSync('docker', [...compose, ...args], { stdio, windowsHide: true })
  if (result.error || result.status !== 0) throw new Error('Local PostgreSQL backup operation failed.')
}

function dump(path) {
  const fd = openSync(path, 'wx')
  let completed = false
  try {
    command(['pg_dump','--format=custom','--no-owner','--username',role,database], ['ignore',fd,'inherit'])
    completed = true
  } finally {
    closeSync(fd)
    if (!completed) rmSync(path)
  }
}

function restoreCheck(path) {
  const fd = openSync(path, 'r')
  const scratch = `wedding_restore_${randomBytes(6).toString('hex')}`
  let created = false
  try {
    command(['createdb','--username',role,scratch], 'inherit')
    created = true
    command(['pg_restore','--exit-on-error','--no-owner','--username',role,'--dbname',scratch],
      [fd,'inherit','inherit'])
    command(['psql','-X','-v','ON_ERROR_STOP=1','-U',role,'-d',scratch,'-c',
      'SELECT name FROM wedding_migrations.history ORDER BY name; SELECT count(*) AS events FROM wedding.events;'], 'inherit')
  } finally {
    closeSync(fd)
    if (created) command(['dropdb','--username',role,scratch], 'inherit')
  }
}

try {
  if (!input || !['dump','restore-check'].includes(action)) {
    throw new Error('Usage: node scripts/db/backup.mjs dump|restore-check <archive-file>')
  }
  if (action === 'dump') dump(resolve(input))
  else restoreCheck(resolve(input))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}

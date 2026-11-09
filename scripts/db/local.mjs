import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const envFile = '.env.compose.local'
const compose = ['compose', '--env-file', envFile, '-f', 'compose.yml', '-p', 'wedding-foundation']

function docker(args, input) {
  const result = spawnSync('docker', [...compose, ...args], {
    cwd: root,
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'inherit', 'inherit'],
  })
  if (result.error || result.status !== 0) {
    throw new Error('Local Docker command failed. See the command output.')
  }
}

function sql(input) {
  docker(['exec', '-T', 'db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', 'wedding_migrator', '-d', 'wedding_dev'], input)
}

function migrate() {
  const directory = new URL('../../db/migrations/', import.meta.url)
  const names = readdirSync(directory).sort()
  if (!names.length || names.some(name => !/^\d{3}_[a-z0-9_]+\.sql$/.test(name))
      || new Set(names.map(name => name.slice(0, 3))).size !== names.length) {
    throw new Error('Invalid migration names or duplicate migration versions.')
  }

  const migrations = names.map(name => {
    const source = readFileSync(new URL(name, directory), 'utf8').replace(/\r\n/g, '\n')
    const digest = createHash('sha256').update(source).digest('hex')
    return { name, source, digest }
  })
  const knownNames = migrations.map(({ name }) => `'${name}'`).join(', ')

  sql(`BEGIN;
SELECT pg_advisory_xact_lock(884720613);
CREATE SCHEMA IF NOT EXISTS wedding_migrations;
REVOKE ALL ON SCHEMA wedding_migrations FROM PUBLIC;
CREATE TABLE IF NOT EXISTS wedding_migrations.history (
  name text PRIMARY KEY,
  sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
DO $guard$
BEGIN
  IF EXISTS (SELECT FROM wedding_migrations.history WHERE name NOT IN (${knownNames})) THEN
    RAISE EXCEPTION 'Unknown migration in database history';
  END IF;
END
$guard$;
${migrations.map(({ name, source, digest }) => `
DO $guard$
BEGIN
  IF EXISTS (
    SELECT FROM wedding_migrations.history WHERE name = '${name}' AND sha256 <> '${digest}'
  ) THEN
    RAISE EXCEPTION 'Checksum mismatch for ${name}';
  END IF;
  IF NOT EXISTS (SELECT FROM wedding_migrations.history WHERE name = '${name}')
     AND EXISTS (SELECT FROM wedding_migrations.history WHERE name > '${name}') THEN
    RAISE EXCEPTION 'Out-of-order migration ${name}';
  END IF;
END
$guard$;
SELECT EXISTS (SELECT FROM wedding_migrations.history WHERE name = '${name}') AS applied \\gset
\\if :applied
\\echo Already applied: ${name}
\\else
${source}
INSERT INTO wedding_migrations.history (name, sha256) VALUES ('${name}', '${digest}');
\\echo Applied: ${name}
\\endif
`).join('\n')}
COMMIT;
`)
}

try {
  if (!existsSync(new URL(`../../${envFile}`, import.meta.url))) {
    throw new Error(`Create ${envFile} from .env.compose.example first.`)
  }
  switch (process.argv[2]) {
    case 'up':
      docker(['up', '-d', '--wait', 'db'])
      break
    case 'migrate':
      migrate()
      break
    case 'test':
      sql(readFileSync(new URL('../../tests/db/foundation.sql', import.meta.url), 'utf8'))
      break
    case 'verify':
      sql("SELECT current_database(), current_setting('server_version'); SELECT name, applied_at FROM wedding_migrations.history ORDER BY name;")
      break
    default:
      throw new Error('Usage: node scripts/db/local.mjs up|migrate|test|verify')
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}

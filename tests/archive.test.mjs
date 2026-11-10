import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import { makeArchive } from '../scripts/worker/archive.mjs'

test('ZIP preserves original bytes, manifest hashes and Unicode guestbook', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wedding-zip-fixture-'))
  const path = join(directory, 'fixture.zip')
  const bytes = Buffer.from('fixture original')
  const id = '00000000-0000-0000-0000-000000000000'
  try {
    const result = await makeArchive(path, [{ id, filename: '../photo.jpg', byte_size: bytes.length,
      object_key: 'fixture-key' }], [{ message_text: 'Γειά!' }], async key => {
      assert.equal(key, 'fixture-key')
      return Readable.from([bytes])
    })
    assert.equal(result.count, 1)
    assert.match(result.sha256, /^[a-f0-9]{64}$/)
    const manifest = JSON.parse(execFileSync('tar', ['-xOf', path, 'manifest.json'], { encoding: 'utf8' }))
    assert.equal(manifest.originals[0].sha256, createHash('sha256').update(bytes).digest('hex'))
    assert.deepEqual(execFileSync('tar', ['-xOf', path, manifest.originals[0].path]), bytes)
    const book = execFileSync('tar', ['-xOf', path, 'guestbook.json'])
    assert.equal(manifest.guestbook.sha256, createHash('sha256').update(book).digest('hex'))
    assert.equal(JSON.parse(book).at(0).message_text, 'Γειά!')
  } finally {
    await rm(path, { force: true })
    await rmdir(directory)
  }
})

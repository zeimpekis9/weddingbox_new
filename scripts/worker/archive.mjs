import yazl from 'yazl'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

function safeName(value) {
  const result = value.replace(/[^\p{L}\p{N}._ -]/gu, '_').trim()
  return !result || result === '.' || result === '..' ? 'original' : result
}

export async function makeArchive(path, originals, messages, openObject, onProgress = async () => {}) {
  const archive = new yazl.ZipFile()
  archive.on('error', error => archive.outputStream.destroy(error))
  const output = pipeline(archive.outputStream, createWriteStream(path, { flags: 'wx' }))
  // The same promise is awaited below after entries have been queued.
  output.catch(() => {})
  const manifest = []
  try {
    for (const original of originals) {
      const name = `originals/${original.id}/${safeName(original.filename)}`
      const hash = createHash('sha256')
      let bytes = 0
      const expected = Number(original.byte_size)
      const measured = new Transform({
        transform(chunk, encoding, callback) {
          bytes += chunk.length
          if (bytes > expected) return callback(new Error('Original length exceeds metadata'))
          hash.update(chunk)
          callback(null, chunk)
        },
        flush(callback) {
          callback(bytes === expected ? null : new Error('Original length differs from metadata'))
        },
      })
      const source = await openObject(original.object_key)
      archive.addReadStream(measured, name, { compress: false, size: expected })
      const transfer = pipeline(source, measured)
      await Promise.race([transfer, output.then(() => { throw new Error('Archive closed early') })])
      manifest.push({ id: original.id, path: name, bytes, sha256: hash.digest('hex') })
      await onProgress(manifest.length)
    }
    const book = Buffer.from(JSON.stringify(messages, null, 2), 'utf8')
    archive.addBuffer(book, 'guestbook.json')
    archive.addBuffer(Buffer.from(JSON.stringify({
      originals: manifest, count: manifest.length, messageCount: messages.length,
      guestbook: { bytes: book.length, sha256: createHash('sha256').update(book).digest('hex') },
    }, null, 2)), 'manifest.json')
    archive.end()
    await output
    const checksum = createHash('sha256')
    for await (const chunk of createReadStream(path)) checksum.update(chunk)
    return { sha256: checksum.digest('hex'), bytes: (await stat(path)).size, count: manifest.length }
  } catch (error) {
    archive.outputStream.destroy()
    await output.catch(() => {})
    throw error
  }
}

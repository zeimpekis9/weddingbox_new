import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CopyObjectCommand, CreateMultipartUploadCommand, DeleteObjectCommand,
  GetObjectCommand, HeadObjectCommand, ListPartsCommand, PutObjectCommand, S3Client, UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { readR2Config } from './r2-config'

let instance: ReturnType<typeof configure> | undefined

function configure() {
  const config = readR2Config()
  if (!config) throw new Error('R2 is unavailable')
  const client = new S3Client({ ...config, maxAttempts: 2, requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED' })
  const Bucket = config.bucket
  const sendOptions = () => ({ abortSignal: AbortSignal.timeout(15000) })
  return {
    async putThemeImage(key: string, body: Buffer) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body,
        ContentType: 'image/webp', CacheControl: 'private, no-store', IfNoneMatch: '*' }), sendOptions())
      const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }), sendOptions())
      if (head.ContentType !== 'image/webp' || head.ContentLength !== body.length) throw new Error('Artwork verification failed')
    },
    deleteThemeImage(key: string) {
      return client.send(new DeleteObjectCommand({ Bucket, Key: key }), sendOptions())
    },
    async signSingle(key: string, type: string) {
      return getSignedUrl(client, new PutObjectCommand({
        Bucket, Key: key, ContentType: type, IfNoneMatch: '*',
      }), { expiresIn: 300, signableHeaders: new Set(['content-type', 'if-none-match']) })
    },
    async create(key: string, type: string, id: string) {
      const result = await client.send(new CreateMultipartUploadCommand({
        Bucket, Key: key, ContentType: type, Metadata: { 'upload-id': id },
      }), sendOptions())
      if (!result.UploadId) throw new Error('Multipart initialization failed')
      return result.UploadId
    },
    signPart(key: string, id: string, part: number) {
      return getSignedUrl(client, new UploadPartCommand({
        Bucket, Key: key, UploadId: id, PartNumber: part,
      }), { expiresIn: 300 })
    },
    async parts(key: string, id: string) {
      const parts = []
      let marker: string | undefined
      do {
        const result = await client.send(new ListPartsCommand({
          Bucket, Key: key, UploadId: id, PartNumberMarker: marker,
        }), sendOptions())
        parts.push(...(result.Parts ?? []))
        marker = result.IsTruncated ? result.NextPartNumberMarker : undefined
        if (result.IsTruncated && !marker) throw new Error('Invalid multipart listing')
      } while (marker && parts.length <= 64)
      return parts
    },
    complete(key: string, id: string, parts: { PartNumber?: number; ETag?: string }[]) {
      return client.send(new CompleteMultipartUploadCommand({
        Bucket, Key: key, UploadId: id, MultipartUpload: {
          Parts: parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })),
        },
      }), sendOptions())
    },
    async abort(key: string, id: string) {
      await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: id }), sendOptions())
    },
    async head(key: string) {
      try {
        return await client.send(new HeadObjectCommand({ Bucket, Key: key }), sendOptions())
      } catch (error) {
        if (error && typeof error === 'object' && '$metadata' in error &&
          (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404) return null
        throw error
      }
    },
    async sniff(key: string, etag: string) {
      const result = await client.send(new GetObjectCommand({
        Bucket, Key: key, Range: 'bytes=0-4095', IfMatch: etag,
      }), sendOptions())
      if (!result.Body) throw new Error('Object content unavailable')
      return result.Body.transformToByteArray()
    },
    copy(source: string, target: string, etag: string, id: string, contentType: string) {
      return client.send(new CopyObjectCommand({
        Bucket, Key: target, CopySource: `${Bucket}/${source}`, CopySourceIfMatch: etag,
        MetadataDirective: 'REPLACE', Metadata: { 'upload-id': id }, ContentType: contentType,
      }), sendOptions())
    },
    signedGet(key: string, filename?: 'wedding-event.zip') {
      return getSignedUrl(client, new GetObjectCommand({
        Bucket, Key: key, ResponseContentDisposition: filename ? `attachment; filename="${filename}"` : undefined,
      }), { expiresIn: 60 })
    },
  }
}

export function r2() {
  return instance ??= configure()
}

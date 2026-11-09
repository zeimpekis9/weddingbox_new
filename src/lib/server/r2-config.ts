export function readR2Config(env: NodeJS.ProcessEnv = process.env) {
  if (typeof window !== 'undefined') throw new Error('R2 configuration is server-only')
  const accountId = env.R2_ACCOUNT_ID?.trim()
  const bucket = env.R2_BUCKET?.trim()
  const jurisdiction = env.R2_JURISDICTION?.trim()
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim()

  if (![accountId, bucket, jurisdiction, accessKeyId, secretAccessKey].some(Boolean)) return null
  if (!accountId || !/^[a-f0-9]{32}$/.test(accountId)) throw new Error('Invalid R2_ACCOUNT_ID')
  if (!bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('Invalid R2_BUCKET')
  }
  if (jurisdiction !== 'eu' && jurisdiction !== 'default') {
    throw new Error('R2_JURISDICTION must be eu or default')
  }
  if (!accessKeyId || !secretAccessKey) throw new Error('Missing R2 credentials')

  const suffix = jurisdiction === 'eu' ? '.eu' : ''
  return {
    bucket,
    endpoint: `https://${accountId}${suffix}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: { accessKeyId, secretAccessKey },
  }
}

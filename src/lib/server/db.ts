import { Pool } from 'pg'

let pool: Pool | undefined

export function database() {
  if (!pool) {
    const connectionString = process.env.WEDDING_DATABASE_URL
    if (!connectionString) throw new Error('Database is unavailable')
    pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 2000,
      statement_timeout: 4000, idleTimeoutMillis: 30000 })
    pool.on('error', () => console.error('Wedding database idle connection failed'))
  }
  return pool
}

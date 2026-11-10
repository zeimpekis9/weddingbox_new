import { randomUUID } from 'node:crypto'

export async function claimJob(db, paused = false) {
  const { rows: [job] } = await db.query(`
    WITH next AS (
      SELECT id FROM wedding.background_jobs
      WHERE ((state='queued' AND run_at <= now()) OR (state='running' AND lease_until <= now()))
        AND NOT $2::boolean
      ORDER BY CASE WHEN kind='thumbnail' THEN 0 ELSE 1 END,run_at,id
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE wedding.background_jobs AS job
    SET state='running', lease=$1, lease_until=now()+interval '90 seconds', attempts=attempts+1, progress=0
    FROM next WHERE job.id=next.id RETURNING job.*
  `, [randomUUID(), paused])
  return job
}

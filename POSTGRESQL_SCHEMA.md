# Proposed PostgreSQL schema and operations

## Implemented local foundation

Compose runs PostgreSQL 18.6 in the `wedding-foundation` project. The port is bound to loopback and the named volume survives restarts. Copy `.env.compose.example` to `.env.compose.local` and set a unique local password. From the repository root run:

```sh
node scripts/db/local.mjs up
node scripts/db/local.mjs migrate
node scripts/db/local.mjs verify
node scripts/db/local.mjs test
docker compose --env-file .env.compose.local -f compose.yml -p wedding-foundation restart db
node scripts/db/local.mjs verify
```

`001_core.sql` creates the three core tables with event foreign keys, moderation checks and feed indexes. `002_membership.sql` creates owner/moderator memberships and a restricted authorization function. The API capability role has no table grants. A later API must derive the actor from a verified session and apply the event predicate to each query or mutation in the same transaction. The current Supabase UI does not call this function.

The local runner executes versioned SQL under a transaction advisory lock and keeps a SHA-256 history ledger. Reruns skip identical versions and reject drift or out-of-order versions. Add a new migration to evolve the schema. This runner only addresses the isolated local Compose database. PostgreSQL pooling, production roles, session tables and storage metadata remain planned below.

Retain the three application tables and valid UUIDs. Use node-postgres and versioned SQL migrations with a checksum ledger. The repository has no ORM to port. Pick a supported PostgreSQL major after inspecting the source and restore tooling, then pin image tag/digest and document upgrade cadence. Compose uses a named volume, private bridge, secret-injected config, pg_isready startup health and readiness SELECT 1 with timeout. No public port in production. Run schema changes as a restricted migration role. API and worker roles have narrowly scoped privileges, no ownership or bypass privileges. Database secrets remain server-only.

| Entity | Columns and invariants |
|---|---|
| events | Existing UUID PK immutable, canonical unique slug and branding, created_at, optional archived_at, feed revision. Settings and owner creation atomic. |
| event_settings | Existing ID preserved, event_id NOT NULL UNIQUE FK, validated booleans and enums, upload window, independent gallery/guestbook policy, locale, limits, moderation, retention and display settings. |
| users, event_members | Users UUID, unique normalized email, password hash, status, MFA reference. Membership PK (event_id,user_id), role owner/moderator. Index (user_id,event_id). No guest users. |
| admin_sessions, admin_mfa | Hashed session token PK, user FK, expiry/idle/revocation and MFA assurance. Encrypted secret, individually hashed recovery codes. Index user and expiry. |
| guest_access_tokens, guest_grants | UUID, event_id, secret digest, purpose/scopes, expiry, revoked_at and generation. Grant scoped to source token and event via composite FK. No mandatory personal attributes. |
| submissions | Existing UUID/event_id/type/text/name/time, approval becomes pending/approved/rejected/hidden, deleted_at, optional media metadata relation through composite FK. Text and voice remain typed in this table to avoid duplicate models. Preserve legacy source separately in migration journal. |
| media | UUID, event_id, purpose, unique immutable object key, original filename, detected MIME, exact bytes, SHA-256 when computed, lifecycle and timestamps. Cover reference uses same event constraint. Derivatives use separate keys/rows linked to media. |
| upload_sessions, upload_parts | UUID and event_id, grant/owner scope, media ID, staging key, expected size/type, part size, provider upload ID, expiry, idempotency key and request fingerprint. Unique (event_id,actor_scope,idempotency_key). Parts PK (event_id,upload_session_id,part_number) with byte count and observed ETag; provider ListParts is authoritative. |
| background_jobs | event_id, kind, target ID, dedupe key, payload version, run_at, attempts, lease expiry, fencing token and last safe error. Partial indexes for runnable jobs and expired leases. Exports use same queue plus dedicated metadata for progress/archive/checksum/expiry. |
| audit_logs, backup_records | Append-only event logs with actor/action/entity/result and timestamps. Operational backup metadata may be system-wide with manifest coverage by event. No raw secrets or media. |

All event-owned child records have nonnullable event_id. Enforce event-matching composite references with parent UNIQUE(event_id,id), and deny cross-event lookups in every API and worker query. Prefer explicit soft deletion plus asynchronous cleanup over broad destructive cascade. Use indexed feed queries on (event_id,created_at DESC,id DESC) with partial approved/nondeleted index, admin queries on (event_id,moderation,created_at DESC,id DESC), and indexes for FK, session expiry and cleanup. Validate plans with EXPLAIN ANALYZE on synthetic volumes. Keep approval distinct from media lifecycle PENDING, UPLOADING, UPLOADED, PROCESSING, READY, FAILED, REJECTED and DELETED. Carry approval history via audit rows, with feed revision updated in the same transaction as visibility changes.

## Transactions and pool

Start with max 10 connections per API process, 4 per worker, and 5 reserved for migrations/ops; adjust using observed saturation and total replica count. Short acquisition/statement/lock timeouts, finite request queue, and release clients in finally. No transaction around R2 network calls. Use a checked-out client for BEGIN/COMMIT/ROLLBACK. Finalize with conditional transition, one media/submission reference and one job insertion transaction after durable-object evidence. Claim jobs with SELECT FOR UPDATE SKIP LOCKED, record lease and fencing token, commit, process outside transaction and fence result writes. Apply bounded attempts and dead-letter/replay controls. Explicit role and event predicates form the initial security boundary with composite DB constraints. Optional RLS defense in depth requires separately tested transaction-local context and clean pooled connection reuse.

## Migration order and rollback

Create application and operator schemas/roles first, then additive event constraints and new tables. Import into staging, audit NULL/orphan rows and duplicate settings before enforcing constraints, preserve UTC timestamps and canonicalize ambiguous slugs only with owner sign-off. Validate FKs/indexes in staging and rehearse index locks. Before writes, rollback by removing target deployment. After writes, preserve data and prefer forward repair with tested reverse/replay as in the migration plan. Back up using nightly encrypted logical dumps and base backups/WAL archiving for PITR; restore both modes to isolated instances. See the [migration plan](DATABASE_MIGRATION_PLAN.md) and [recovery plan](PERFORMANCE_AND_RECOVERY_PLAN.md). [PostgreSQL backup](https://www.postgresql.org/docs/current/backup.html) · [node-postgres transactions](https://node-postgres.com/features/transactions) · [PostgreSQL locking](https://www.postgresql.org/docs/current/sql-select.html)

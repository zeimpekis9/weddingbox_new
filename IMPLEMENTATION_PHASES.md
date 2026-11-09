# Implementation gates

The [migration roadmap](MIGRATION_ROADMAP.md) maps every phase to files and tests. Record evidence and the operator who signed each gate. All gates below are pending.

## Local foundation verification

- Framework changes are isolated from the database changes in Git. Next 14.0.4 and React 18.3.1 were upgraded to Next 16.4.5 and React 19.3.1. Lucide was upgraded for its React 19 peer requirement. Node 24.22.1 was used for verification. Next 16 raises the supported browser baseline, including Safari 16.4+. Test older devices before launch. [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- The production Webpack build and standalone TypeScript check both exited 0 with synthetic Supabase build settings in the restricted environment. Webpack preserves the previous bundler after Turbopack's PostCSS child process failed on Windows. The layout and CSS use installed/system font fallbacks. Guest and admin browser workflows against a live backend were not tested.
- PostgreSQL 18.6 started healthy. Both versioned migrations applied, the ledger was identical after container restart, and a second apply skipped both versions. Authenticated TCP connected to the local database. Transactional SQL fixtures passed before and after restart, including two owners, moderator restrictions, denied cross-event access, disabled account denial and direct API role restrictions.
- R2 configuration tests passed 3/3. ESLint reported zero errors and 15 warnings in legacy UI. Production npm audit reported zero advisories after compatible transitive updates. A full npm audit from the install reported remaining development-tool advisories (9 moderate, 3 high). This phase does not certify the production service.
- Live Supabase inventory remains blocked by DNS and lack of a read-only catalog connection. Local validation of the inventory script confirmed its SQL syntax only. See [dependency audit](SUPABASE_DEPENDENCY_AUDIT.md).
- Local implementation files are `compose.yml`, `.env.compose.example`, `db/migrations/001_core.sql`, `db/migrations/002_membership.sql`, `scripts/db/local.mjs`, `scripts/migration/inventory.sql`, `src/lib/server/r2-config.ts`, `tests/db/foundation.sql`, and `tests/r2-config.test.mjs`. Framework changes are in the manifests, Next/TypeScript/ESLint config, and the existing layout, CSS and route pages.
- Next phase: implement verified server-side admin sessions and membership enforcement, then event-scoped R2 upload sessions. Verify the live source inventory with a replacement read-only connection. Production host, independent backup destination and R2 jurisdiction validation remain open.

- [ ] Authorize discovery of deployed SQL, Auth, Storage, Realtime and Edge Functions. Capture an encrypted source snapshot and document ownership.
- [ ] Reproduce and secure the baseline on a supported Next release. Capture UI parity with synthetic inputs.
- [ ] Prove Compose restart durability, migration idempotency, role grants and PostgreSQL restore.
- [ ] Prove two owner sessions and MFA, event membership, anonymous upload grant exchange and separate gallery/display scopes.
- [ ] Prove durable upload receipts, exact original bytes, replay/cancel recovery and least privilege against R2 staging.
- [ ] Prove gallery, guestbook, cover and admin parity, approval-only display, audited moderation and device compatibility.
- [ ] Rehearse 500 active guests, upload-only mode, venue connectivity, failover and independent restore. Save actual results and approval before launch.
- [ ] Rehearse migration and rollback. Reconcile row/object manifests, sign off exceptions, freeze legacy writes and execute cutover in the approved window.
- [ ] Confirm observation period and runtime independence. Retain or retire source under separate approval.
- [ ] Validate P1 export under concurrent uploads before enabling it for owners.

For each phase attach the changed paths, test commands and results, remaining risks, rollback watermark and owner decision. The [database migration plan](DATABASE_MIGRATION_PLAN.md) defines the write boundary and rollback decision.

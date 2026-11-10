# Supabase dependency audit

Historical inventory from before runtime removal. Live inspection is optional and applies only if an owner identifies data that needs preservation.

## Runtime replacement map

| Source | Existing dependency | Target |
|---|---|---|
| package.json, package-lock.json, src/lib/supabase.ts:1–6 | Browser SDK and env; auth helpers dependency unused; same module supplies DTO types | Shared domain DTOs, typed fetch client, server-only pg and R2 clients; remove SDK packages and public env at final gate |
| src/app/[slug]/page.tsx:43–124 | PostgreSQL changes INSERT on submissions by approved only, events UPDATE by slug; reads events, settings and submissions | Guest capability, public-safe projection, event-keyed cursor feed and approved snapshot |
| src/components/UploadModal.tsx:58–188 | Bucket upload, getPublicUrl, data URL fallback, submissions insert/update, auth getSession logging | Upload session API, direct R2 transfer, verified receipt, server moderation |
| src/components/VoiceModal.tsx:215–263 and 340–385 | Two upload/getPublicUrl and submissions insert/update paths | Same upload API with voice purpose and duration checks |
| src/components/MessageModal.tsx:26–55 | submissions insert/update, client approval timer | Idempotent guestbook endpoint, server approval policy |
| src/app/admin/components/LoginForm.tsx:21; src/app/admin/page.tsx:47–57 | signInWithPassword, getUser, signOut | MFA, application-owned cookie session and membership |
| src/app/admin/page.tsx:61–352 | All event CRUD, cover upload/public URL, settings and submission moderation/delete | Event-scoped admin routes; approved owner/role checks; cover upload purpose; atomic metadata and audit |
| src/app/admin/components/{EditEventModal,EventSidebar,TabManager,TabManager-backup}.tsx | Type imports; TabManager renders URL fields | Shared DTOs and authorized media references; remove stale imports |
| src/components/ImageViewerModal.tsx; next.config.js | Raw sharing/download links; Supabase image domain | Private preview and authorization endpoint; remove domain |
| README.md, .env.local.example, vercel.json | Provider setup and hosted configuration | Compose deployment documentation, env names only, secrets injected at runtime |

Legacy keys include event UUID/photos/timestamp with optional random suffix, video in photos, event UUID/voices/voice-timestamp with media extension or .mp3, and event UUID/photos/cover-timestamp. Map original paths independently of displayed extension. Data URLs can contain entire media files. Object rows alone do not contain the bytes.

## All tracked SQL scripts

| Script | Observed definitions or policy |
|---|---|
| database-only.sql | events UUID PK and unique slug; event_settings UUID PK, nullable/nonunique event_id FK; submissions UUID PK, nullable event_id FK, photo/video/message/voice check, content_url, message_text, guest_name, approved, created_at. Both FKs cascade. RLS with public event/settings reads, generic authenticated CRUD, arbitrary submission insert and approved read; demo seed. |
| run-this-first.sql | Full branding, cover, tab and approval additions. |
| update-schema.sql | Overlapping branding and tab additions. |
| add-font-field.sql | Overlapping font addition and backfill. |
| fix-rls-policies.sql | Permissive submission policies including anonymous reads. |
| fix-upload-rls.sql | Broad upload/read grants via permissive submission policies. |
| fix-storage-policies.sql | Public wedding-media declaration, 10 MiB and MIME list, bucket-only INSERT/SELECT/UPDATE, broad anonymous storage grants and submissions read. Existing bucket can retain different config. |
| fix-storage-policies-final.sql | Storage RLS and broad bucket-only INSERT/SELECT/UPDATE. |
| add-update-policy.sql | Bucket-only UPDATE despite authenticated label; PUBLIC FOR ALL variant. |
| disable-rls.sql | Disables submissions RLS. |
| simple-fix.sql | Permissive insert and approved SELECT reset, suggests disabled RLS. |
| complete-diagnostic.sql | Diagnostics and broad upload/read policies. |
| rls-policies.sql, seed-data.sql, setup-complete.sql | Empty tracked files. |

No tracked application-defined functions, triggers, views, RPCs, Realtime publications or Edge Functions. No explicit non-PK/unique indexes. Policy scripts are alternatives and overlapping patches, with no reliable application order. RLS policies can be additive. No statement here verifies which policies or bucket limits are live.

## Required live inventory before transfer

The approved anonymous REST schema probe produced no HTTP response. The configured hosted endpoint failed DNS resolution, including outside the restricted shell. The checkout supplies public REST settings and a service-role variable, but no read-only PostgreSQL connection or provider dashboard access. The service role was not used. Run `psql -X --dbname=service=wedding_inventory -f scripts/migration/inventory.sql` once a valid read-only PostgreSQL service entry is provisioned. Capture the output privately. The script lists metadata in a read-only transaction. Policy/function bodies, bucket/object inventory, dashboard Auth settings and Edge Functions still require authorized operator access.

With approved read-only credentials, capture catalog columns/defaults, constraints, indexes, views, functions, triggers, policies, grants, extensions and publication/filter membership. Record exposed schemas, auth identity providers/MFA settings and approved owner mappings, all buckets with visibility/CORS/limits, paginated object keys/sizes, Realtime settings and dashboard-only functions/integrations. Store redacted inventories outside the repository. Keep raw production snapshots encrypted and restricted. Inventory access and retention need owner approval.

Export only application data plus narrowly scoped owner mapping, copy objects separately, and reconcile both. See [database migration plan](DATABASE_MIGRATION_PLAN.md). [Supabase object download guidance](https://supabase.com/docs/guides/storage/management/download-objects)

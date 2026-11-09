# Phase 0 repository audit

Snapshot: commit 111cb48, 2026-11-09. Inspected the tracked tree, browser entry points, dependency lock, SQL scripts, and deployment configuration. Provider dashboards, live data, DNS, bucket configuration and production traffic were outside this repository audit. [Feature matrix](FEATURE_MATRIX.md) classifies the observed implementation.

## Repository and stack

| Area | Evidence |
|---|---|
| Frontend | Next.js App Router 14.0.4, React/React DOM 18.3.1, TypeScript 5.9.3, Tailwind 3.4.19 (lockfile). Routes are /, /[slug], /admin. Client pages and modals in src/app and src/components. |
| Backend | Browser calls Supabase directly via src/lib/supabase.ts. Supabase JS 2.90.0; auth helpers 0.8.7 installed, no import found. No Next Route Handlers, middleware, worker or separate backend. |
| Data | Supabase PostgreSQL, no ORM. Handwritten TypeScript types do not prove applied schema. Three application tables are described in [dependency audit](SUPABASE_DEPENDENCY_AUDIT.md). |
| Storage | Browser uses wedding-media public URLs for original assets and covers, plus base64 fallback inside submissions.content_url. No private access broker, derivatives, lifecycle or backup jobs. |
| Deployment | vercel.json declares npm install, npm run build and .next. No Docker, CI, reverse proxy, health checks or infrastructure config in tracked tree. Hosting status is unknown. |
| Configuration | Browser requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. .env.local.example uses VITE_* names and includes a service-role variable name. A credential-like string is tracked in README; treat as exposed if confirmed and rotate through an approved operational action. No value reproduced here. |
| Docs and tests | README references absent supabase/schema.sql and src/lib/utils.ts and advertises ZIP without implementation. No tracked automated tests, test script, lint config or load harness. TabManager-backup.tsx is an unused alternate component. |

## End-to-end traces and release blockers

1. **P0 upload integrity.** UploadModal.tsx:24–52 chooses the first file, caps it at 5 MiB, trusts browser MIME and reads a data URL for preview. Lines 58–118 try a timestamp-derived storage key, then a new key, then encode bytes into PostgreSQL. Lines 150–188 insert a separate row and close the modal after insert success, without server HEAD verification. Network ambiguity can leave duplicate/orphan objects. There is no durable session, cancellation, progress beyond an uploading flag, or safe recovery. Browser diagnostics log filename, path and a session object.
2. **P0 isolation and privacy.** [slug]/page.tsx:90–124 scopes its initial feed by event and approval. The subscription at lines 43–57 filters only on approval and appends directly to state. If provider publication and permissions allow it, cross-event INSERTs can appear. Approval and removal updates are missed by this feed subscription. The 30-second backup refresh reloads event/settings only. Raw URLs and permissive SQL variants leave access dependent on live provider policy.
3. **P0 administrative authorization.** admin/page.tsx checks Supabase user presence, lists events, and directly mutates records. The SQL grants generic authenticated CRUD, with no event membership. Event creation spans settings and optional cover writes. Deletion spans multiple database requests, and submission/event deletion does not delete object bytes. Cover upload and URL assignment can diverge. LoginForm uses password sign-in. No application MFA, owner/moderator role checks or audit trail.
4. **P0 moderation and displays.** Guest submits its own approved boolean. Upload, voice and text write approved=true immediately when manual mode is off, then try browser timers for the same update. This does not implement an enforceable delay. Guestbook and gallery share the guest feed; ceremony tabs are filters. No fullscreen ceremony player, live guestbook display or offline cache.
5. **P0 unsupported runtime baseline.** Next.js 14 is outside current support. Preserve the App Router and components, and isolate the supported-version upgrade behind a compatibility gate. Build currently fetches Inter from Google Fonts, and globals.css has a remote CSS font import. [Next.js support policy](https://nextjs.org/support-policy)
6. **P1 UX and assets.** Guest access already has no account. Upload requires opening a modal, selecting one file and confirming, with optional name. Gallery has media cards, a viewer and browser-level share/download, with no authorized original delivery, thumbnail pipeline or paginated server API. Existing branding/tabs can be carried forward. English strings are hardcoded. Native microphone recording has browser branching and two save paths; both need preservation tests.

## Checks actually run

- Installed TypeScript compiler with `--noEmit --incremental false` exited 0. This checks types only.
- `npm run build` exited 1 when sandbox DNS could not resolve fonts.googleapis.com for next/font Inter. Full production build remains unverified.
- Offline npm audit returned an empty cached result. No authoritative online advisory scan was obtained. Treat the dependency gate as open.
- No production endpoints were contacted. No browser, database, storage, authorization, load or restore test ran. No feature is classified VERIFIED WORKING or PRODUCTION READY.

See [target architecture](TARGET_ARCHITECTURE.md) and [migration roadmap](MIGRATION_ROADMAP.md) for approval scope and sequence.

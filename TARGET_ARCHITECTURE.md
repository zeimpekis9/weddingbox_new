# Target architecture

Cloudflare R2, self-hosted PostgreSQL, complete Supabase removal, accountless guests, and event-scoped administration are approved. Preserve Next App Router, React presentation, and the event branding, guestbook, viewer and admin workflows. WeddingBox is a functional reference. Its demo does not persist uploads. [Product](https://weddingbox.io/en) · [Demo](https://weddingbox.io/en/demo)

## Proposed deployment

One maintained Linux host to start, with TLS reverse proxy, standalone Next Node container, one worker container from the same repository, PostgreSQL on a private network with a persistent volume, and an independently managed backup destination. Compose supports local and initial production layouts with distinct secrets, env files, and volumes. Migrations run as a one-shot service with an advisory lock before compatible app rollout. A second API replica can share PostgreSQL sessions/limits; worker scales separately when measured. A single host is a failure domain. Document replacement-host provisioning and test recovery within the target RTO. A split-host option isolates database from API/worker failures but adds network and deployment work. Retaining Vercel would require secure remote DB connectivity, separate worker hosting, and revised pooling. Proposed initial choice is Compose, pending host and recovery approval.

Serve hashed public static assets via CDN. Mark event HTML and authenticated data private/no-store and noindex; unauthenticated media delivery remains disabled. Use short signed R2 GET for original bytes, and defer private CDN caching until cache-hit authorization, eviction and cache-key behavior are tested. Keep tokens out of CDN, proxy and application logs. Separate TLS/secret rotation and managed access to the backup destination from app duties.

## HTTP contracts

Use JSON errors with stable codes and request IDs, plus Retry-After for overload. Use server validation and paginated projections, no raw database rows. Route files below are proposed paths.

| Endpoint | Authorization and behavior |
|---|---|
| POST /api/guest/access | Exchange QR secret for short opaque guest capability; remove secret from address before loading optional content. Hash guest link secret, attach scope, expiry and revocation generation. Issue cookie with HttpOnly/Secure/SameSite; require Origin and CSRF protection on mutations. |
| GET /api/events/:eventId/bootstrap | Upload capability for public-safe event and limits. Load gallery only on demand and with separate gallery scope. |
| POST /api/events/:eventId/uploads | Init with client idempotency key, filename/type/size/purpose. Return session ID, mode and limited instructions. |
| GET /api/events/:eventId/uploads/:id | Resume state, receipt and received parts for originating capability. |
| POST /api/events/:eventId/uploads/:id/{parts,complete,cancel} | Mint limited parts, recover/finalize, or cancel. Bind to event, grant and upload ID. Completion returns UPLOADED receipt or 202 verifying. |
| GET /api/events/:eventId/gallery and /api/events/:eventId/media/:id | Separate gallery capability or membership. Cursor projection of approved READY rows; authorize each preview/original separately. |
| GET, POST /api/events/:eventId/guestbook | Read only approved messages with read permission. POST text with write scope, idempotency, bounded length and spam controls. Voice uses upload purpose. |
| GET /api/events/:eventId/display | Display-specific read-only grant. Snapshot revision and bounded approved-ready projection. |
| POST /api/admin/session, /api/admin/session/mfa; GET/DELETE /api/admin/session | Provisioned admin sign-in, short MFA challenge and logout/session validation. |
| GET/POST /api/admin/events; PATCH/DELETE /api/admin/events/:eventId | List membership only. Initial provisioning through operator CLI. Event creation requires explicit operator provisioning authority; owner settings and deletion checks on event routes. |
| GET/PATCH /api/admin/events/:eventId/{settings,submissions,health}; POST/GET /api/admin/events/:eventId/exports | Gate by membership, role and operation. Use specific submission IDs, transactional moderation, separate redacted event health, export status and authorized links. |
| GET /api/health/{live,ready} | Minimal service status. Internal metrics behind separate network/auth. |

Guests scan a random revocable QR link. Propose slug plus fragment token with early bootstrap exchange to avoid passing secrets via HTTP request URL/referrers; test camera/QR readers and immediate native picker. The upload CTA is above the fold with localized privacy copy, file picker invoked by user gesture, then automatic queue start. No identity prompts. Gallery and guestbook stay secondary. The grant survives refresh via short-lived cookie and authorized re-exchange as needed. Rotation invalidates grant issuance and server checks; already signed URLs can live to expiry. Show a friendly retry state for unavailable bootstrap.

## Authorization and privacy

Two provisioned owners per initial event, optional moderators. Admin passwords use Argon2id, rate-limit credentials and challenges, require TOTP and one-use hashed recovery codes; encrypt TOTP secrets under an external key. Opaque admin session IDs hashed at rest, secure cookies, fixation-resistant rotation after MFA, bounded idle and absolute expiry, logout/revoke, Origin plus CSRF. Membership is checked at every admin event operation; owner-only settings, originals, export and membership; moderators review and moderate only. Reject mismatched event/resource combinations with a uniform response. No guest account table. Reject unsafe filenames and executable payloads, encode user text, set CSP, HSTS, referrer policy and nosniff. Preserve bytes while limiting exposed EXIF in generated previews. Capture actor/action/event/result in audit logs without token values, filenames or guest message text. Validate retention, minors/privacy notice and vendor/region terms with event owners before rollout.

## Displays and media processing

Use bounded conditional polling for ceremony screens, initially every 5 seconds with jitter/backoff and per-event revision/ETag. Gallery loads on demand; refresh visible lists only with bounded intervals and cursor-based fetching. No DB scan per tick. Cache approved snapshot/previews on dedicated display with bounded storage and expiry; remove revoked/hidden items on reconnect. Offline viewing can show previously approved items until expiry, so disclose and cap staleness, and provide local purge. Two modes preserve pause, keyboard, crossfade/reduced motion, branding and optional QR; guestbook displays approved text only. Compare SSE if polling fails load/staleness goals; SSE requires connection/fan-out and replay design. WebSockets add bidirectional complexity without a current requirement.

Worker leases PostgreSQL jobs and generates thumbnails/preview artifacts in sandboxed subprocesses with CPU/memory/time limits and format verification. It keeps originals separate. Media acceptance and publication are separate states. Emergency mode protects upload API and pauses exports/optional processing. See [storage](R2_STORAGE_DESIGN.md) and [recovery](PERFORMANCE_AND_RECOVERY_PLAN.md).

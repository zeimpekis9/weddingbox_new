# Wedding Guest Memories

Guests scan an event QR code to send photos and videos, write or record guestbook messages, and browse the private gallery when enabled. Event owners sign in at `/admin` with a password and authenticator code. PostgreSQL stores event data and authorization. Private Cloudflare R2 stores originals, previews and exports.

## Local development

1. Use Node 24 and Docker Compose. Copy `.env.compose.example` to `.env.compose.local` and set a unique local database password.
2. Run `npm ci`, `node scripts/db/local.mjs up`, and `node scripts/db/local.mjs migrate`.
3. Give the web process a PostgreSQL login granted `wedding_api`. Copy `.env.local.example` to `.env.local` and configure `WEDDING_DATABASE_URL`, `WEDDING_APP_ORIGIN`, `WEDDING_ADMIN_MFA_KEY`, and the private R2 bucket settings. Store private values outside version control.
4. Provision the first event and owner using `scripts/admin/provision.mjs`. Use the resulting event ID when provisioning the second owner. Run `npm run dev` and open `/admin`.
5. Create the guest QR in the owner interface. The QR opens `/join/[eventId]` with a scoped guest link. Event address aliases also lead to that page, where the guest link is still required.

The [database guide](POSTGRESQL_SCHEMA.md) describes provisioning. See [R2 storage](R2_STORAGE_DESIGN.md) for bucket and CORS settings and [delivery progress](PROGRESS.md) for verification status.

## Build and verification

- Run `npm run build`, `npm run typecheck`, `npm run lint` and `npm test`.
- With the built app and the local database available, run `npm run test:admin` and `node --test tests/browser/guest.test.mjs` using Chrome.
- Build the Linux image with `docker build -t wedding-app-local:verify .`. The app compilation runs without network access after dependencies are installed. Configure database, R2 and MFA secrets at runtime. The same image can run `node scripts/worker/run.mjs` with separate worker credentials.

See the [recovery and load plan](PERFORMANCE_AND_RECOVERY_PLAN.md) for restore, worker and staging exercises.

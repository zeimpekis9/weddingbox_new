# Wedding Guest Memories

Guests scan an event QR code to send photos and videos, write or record guestbook messages, and browse the private gallery when enabled. Event owners sign in at `/admin` with a password and authenticator code. PostgreSQL stores event data and authorization. Private Cloudflare R2 stores originals, previews and exports.

## Local development

1. Use Node 24 and Docker Compose. Copy `.env.compose.example` to `.env.compose.local` and set a unique local database password.
2. Run `npm ci`, `node scripts/db/local.mjs up`, and `node scripts/db/local.mjs migrate`.
3. Give the web process a PostgreSQL login granted `wedding_api`. Copy `.env.local.example` to `.env.local` and configure `WEDDING_DATABASE_URL`, `WEDDING_APP_ORIGIN`, `WEDDING_ADMIN_MFA_KEY`, and the private R2 bucket settings. Store private values outside version control.
4. Provision the first event and owner using `scripts/admin/provision.mjs`. Use the resulting event ID when provisioning the second owner. Run `npm run dev` and open `/admin`.
5. Create the guest QR in the owner interface. The QR opens `/join/[eventId]` with a scoped guest link. Event address aliases also lead to that page, where the guest link is still required.

The [database guide](POSTGRESQL_SCHEMA.md) describes provisioning. See [R2 storage](R2_STORAGE_DESIGN.md) for bucket and CORS settings and [delivery progress](PROGRESS.md) for verification status.

### Local Demo Wedding

With local Compose PostgreSQL migrated and the EU `weddingbox-staging` R2 settings in `.env.local`, run:

```powershell
npm run build
node --env-file=.env.local scripts/demo/local.mjs serve --local-only
```

Open [the local QR invitation](http://localhost:3001/invite) and choose **Preview guest experience**. The demo uses a separate PostgreSQL database, a dedicated event namespace in the staging bucket, and synthetic media. The app, invitation and worker stay running while the launcher runs. Keep both listener ports private. The invitation QR targets this computer's localhost.

For owner access, run the following in a separate interactive terminal:

```powershell
node --env-file=.env.local scripts/demo/local.mjs setup --local-only
```

Use `admin` / `admin` in that terminal once. Choose a replacement password of 6–24 characters and enroll a TOTP authenticator. Then sign in at [local owner login](http://localhost:3000/admin) as `admin@demo.invalid` with the replacement password and a current code. The pending bootstrap hash is cleared after enrollment. Keep the generated `.env.demo.local` state private so the local instance retains its MFA key and invitation on restart.

### Event themes

Open **Theme studio** from the owner dashboard. Pick a preset, preview edits, and choose **Save draft** or **Publish theme**. Reset restores the selected preset in the preview. Publish to make the reset visible to guests. The Demo Wedding starts with Christmas Elegance. Existing events use Minimal Elegance until an owner publishes a theme.

Apply `009_event_themes.sql` through the migration runner before enabling the studio. Theme configuration has a schema version and separate draft and published revisions. A stale editor must reload before publishing. The app checks the published revision in PostgreSQL and caches the validated configuration by event and revision. Guest access and the ceremony only receive the published snapshot.

The studio accepts static JPEG, PNG and WebP artwork up to 2 MiB and 12 megapixels. It converts artwork to WebP and stores it under the event's private R2 theme prefix. Guests can open only currently published artwork through a scoped grant. Removing artwork from a theme removes its reference when published. It leaves the uploaded object in place for operational retention. An event can upload up to 80 theme assets.

## Build and verification

- Run `npm run build`, `npm run typecheck`, `npm run lint` and `npm test`.
- With the built app and the local database available, run `npm run test:admin` and `node --test tests/browser/guest.test.mjs` using Chrome.
- Build the Linux image with `docker build -t wedding-app-local:verify .`. The app compilation runs without network access after dependencies are installed. Configure database, R2 and MFA secrets at runtime. The same image can run `node scripts/worker/run.mjs` with separate worker credentials.

See the [recovery and load plan](PERFORMANCE_AND_RECOVERY_PLAN.md) for restore, worker and staging exercises.

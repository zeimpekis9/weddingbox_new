# Release verification

## Gates

| Gate | Result | Evidence or required environment |
|---|---|---|
| Code complete for this milestone | PASS | Shared media dialog, responsive layouts, faster initial guest bundle, upload recovery feedback, owner operational status, and staging R2 harness. |
| Local checks | PASS | Next.js production build, TypeScript, lint, 13 unit tests, PostgreSQL HTTP and SQL integration, seeded restore, and zero production dependency advisories. |
| Browser checks | PASS | Chrome 157 and WebKit 27.2 passed workflow and responsive suites. Captured 144 screenshots across both engines. |
| Physical device checks | NOT RUN | iOS Safari and Android Chrome on actual phones were unavailable. Local browser tests simulate touch, mobile user agents and viewport sizes. |
| Live EU R2 from local app | PASS | Authenticated bucket access, Chrome signed JPEG upload, multipart MP4, retry and resume, verified receipts, byte integrity, isolation and fixture cleanup. |
| Local worker with live EU R2 | PASS | Killed the worker after it claimed a synthetic thumbnail job. A second process recovered the expired lease and produced a WebP and verified ZIP. |
| HTTPS staging R2 | NOT RUN | An isolated HTTPS app origin was unavailable. Local CORS evidence applies to `http://localhost:3000`. |
| Independent backup restore | NOT RUN | Independent encrypted destination and a matching PostgreSQL/R2 recovery point required. |
| Representative 100/300/500 guests | NOT RUN | Isolated HTTPS deployment and live R2 required. Local bursts are smoke tests for rendering and authorization only. |
| Production deployment approved | NOT APPROVED | Approval follows successful release verification. |
| Legacy preservation | UNCONFIRMED | Separate owner decision if legacy data is irreplaceable. |

## Repeat locally

- `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`.
- `node --test tests/browser/guest.test.mjs tests/browser/responsive.test.mjs`. Repeat with `WEDDING_BROWSER=webkit` after `npx playwright-core install webkit`. Set `WEDDING_SCREENSHOT_DIR` to save visual evidence. Fixtures use synthetic records, local mocked object transfers, and no production credentials.
- The responsive suite covers 320, 375, 390, 430, 768, 1024 and 1440 CSS pixels, plus 568×320 and 844×390 landscape. It checks public home, guest page, gallery viewer, owner login, QR management, dashboard, admin viewer and ceremony screen. It checks horizontal overflow, visible upload control, dialog sizing, keyboard focus and Escape, QR placement, and hydration errors.
- `node scripts/db/local.mjs test`, `npm run test:admin`, and the [local restore drill](PERFORMANCE_AND_RECOVERY_PLAN.md). HTTP tests cover MFA, event isolation, moderation, unavailable storage and worker lease fencing.

The workflow suites cover a failed completion, reselecting the same file after reload, photo and video batch selection, skipping a received multipart chunk, and showing success only after the receipt. They also exercise written guestbook submission, gallery access, owner sign-in and sign-out, and retaining ceremony messages during a simulated outage.

The earlier loopback run returned HTTP 200 for every request. Page bursts of 100, 300 and 500 had p95 latencies of 384, 842 and 1,482 ms. A 100-request guest bootstrap burst had p95 of 178 ms.

## Windows pre-production drill

- PostgreSQL container restart and logical restore passed. A synthetic event survived the restart and was recovered into a fresh scratch database with all eight migrations. The archive, scratch database and synthetic event were removed. This drill did not exercise PITR or a separate backup destination.
- `WEDDING_LOCAL_BURST=1` and `WEDDING_LOCAL_SOAK_SECONDS=120` with `npm run test:admin` passed on Windows. The 50/100/300/500 page bursts returned HTTP 200 with p95 of 589/634/3,287/3,645 ms. The 100-request grant bootstrap had p95 of 273 ms. The 120-second soak made 580 requests successfully across guest routes. Next.js working set went from 311 to 200 MiB, private memory from 318 to 254 MiB, and handles from 788 to 287. These are two samples after burst load and after soak. Longer resource tracking, mixed media traffic, and off-host load generation remain open.
- `node --env-file=.env.local --test tests/integration/worker-r2.test.mjs` with `WEDDING_WORKER_TEST=local-eu-staging` passed. The test clones only the local schema into a scratch database, holds a media lock, waits for a claim, kills the worker, and advances the captured lease deadline. The restarted worker succeeded on attempt two. The test verified the original SHA-256, decoded the preview, checked the ZIP SHA-256, extracted and compared the original, checked the guestbook checksum, and verified R2 fixture cleanup.
- Repeated the live 718-byte JPEG and 35,651,584-byte MP4 transfers and replayed completion. An upload above 500 MiB was rejected at initialization. A signed staging PUT with synthetic text labeled as JPEG was rejected with HTTP 422 at completion and produced no media row. All six exact fixture keys returned 404 after cleanup.
- Chrome 157 and WebKit 27.2 passed workflow and responsive suites on rerun with 144 combined screenshots. One earlier WebKit viewport run reported a Next.js prefetch access-control console error. It did not recur in the screenshot run.
- Production build, TypeScript, lint with five existing image warnings, 14 unit tests, PostgreSQL SQL checks, and MFA/event-isolation/moderation HTTP tests passed. The initial sandboxed Windows build failed writing generated files. The rerun with workspace write access completed.
- Remaining browser coverage includes physical iOS Safari and Android Chrome, microphone permission and playback on real devices, and browser-initiated multipart recovery on trusted HTTPS. Current real R2 runs use Chrome for the single signed PUT and scripted multipart requests.

For physical phones, use an isolated host or VM with a trusted certificate and restrict the HTTPS listener to test device IPs on the test LAN or private VPN. Bind Next.js to loopback behind the TLS proxy. Set `WEDDING_APP_ORIGIN` and the staging bucket CORS origin to the exact HTTPS origin. Provision disposable events, guest links, owner MFA and scoped worker credentials. Confirm HTTP readiness and login from each phone before testing the picker, interrupted uploads, camera, microphone and playback. Remove the test origin and revoke its links after the rehearsal. No HTTPS origin or phone access was provisioned for this drill.

## Live EU R2 evidence

The production build ran on loopback with local PostgreSQL and the EU `weddingbox-staging` bucket. Authenticated `HeadBucket` returned HTTP 200. Both signed PUT preflights returned 204 with the matching local origin. Chrome uploaded the 718-byte synthetic JPEG, and R2 rejected an overwrite with 412. Signed requests uploaded the 35,651,584-byte synthetic MP4 in five parts. Retrying the first part and reinitializing preserved the part inventory and session ID.

Completion before all bytes returned 409. Successful completion and replay returned the same receipt and one media record. Both originals matched R2 HEAD identity, size and MIME and the source SHA-256 after their staging objects were deleted. Unsigned S3 reads returned 400 `InvalidArgument`. Wrong-event reads and pre-approval gallery access returned 404. All four exact synthetic staging and original keys returned 404 after cleanup, and local fixture records were removed.

Live testing found that R2 did not persist the upload identity carried in the single PUT query string. The app now validates the signed staging key's size, MIME and signature and sets the identity during the conditional server copy. It verifies the destination before issuing the receipt. The extra browser metadata header failed preflight, so the fix preserves the existing CORS headers and bucket policy. The regression suite passed 14 unit tests along with the build, TypeScript and lint checks.

## Repeat on isolated staging

Run `node --test tests/integration/staging-r2.test.mjs` with `WEDDING_STAGING_CONFIRM=isolated-staging`, `WEDDING_STAGING_URL`, `WEDDING_STAGING_EVENT`, `WEDDING_STAGING_OTHER_EVENT`, `WEDDING_STAGING_LINK`, `WEDDING_STAGING_ADMIN_COOKIE`, `WEDDING_STAGING_PHOTO`, and `WEDDING_STAGING_VIDEO`. Use synthetic JPEG and MP4 files, an active worker and an enabled gallery. The MP4 must be at least 32 MiB. Supply the short-lived credentials through the staging secret mechanism. Use a disposable test event, since the test leaves its verified fixtures available for inspection. It exercises CORS, direct transfer, resumed multipart, receipt replay, private originals, cross-event denial, checksums and thumbnail delivery.

Use [the recovery and performance plan](PERFORMANCE_AND_RECOVERY_PLAN.md) for independent restore and representative load. Verify the native file picker, microphone and Safari media playback on physical devices before the release gate.

## Local Demo Wedding

- Production build, TypeScript, lint (five existing image warnings), and 16 unit tests passed. The launcher rejected production mode.
- `node --env-file=.env.local --test tests/integration/demo.test.mjs` with `WEDDING_DEMO_TEST=local-eu-staging` passed against an isolated scratch PostgreSQL database, Chrome and EU staging R2. It covered CLI bootstrap, weak-password and bad-MFA rejection, no session before enrollment, retired bootstrap password, idempotent setup and seed, browser owner login, event isolation, dashboard counts, guestbook, private JPEG and MP4, approval, ceremony display, live signed upload and receipt replay. The scratch database and upload keys were removed. The shared synthetic demo fixtures remain available to the loopback demo.
- Chrome loaded all five local pages and followed the QR preview into the real guest upload form. The loopback invitation rejected forwarded requests and the ceremony rejected anonymous access. The running demo awaits owner enrollment from an interactive terminal. The test enrolled a disposable owner in a separate database.

## Event theme system

- Applied migration 009 to local PostgreSQL and ran the SQL foundation suite. Production build, TypeScript, lint and 18 unit tests passed. The preset tests enforce text, button and border contrast and reject unsupported schemas, unsafe font and image values, and low-contrast overrides.
- Chrome 157 and WebKit 27.2 exercised all six presets at 320px and 1440px. The theme browser suite checked keyboard selection, computed tokens, live preview, draft reload, publish and reset, reduced motion, viewport overflow, and the guest and ceremony themes. The broader guest browser suite covered uploads, recovery, gallery and guestbook.
- The first broader WebKit run reproduced the intermittent admin-link prefetch console error. After disabling speculative prefetch for the affected navigation, the full WebKit suite passed.
- Local PostgreSQL and live EU staging R2 passed owner and guest isolation, draft confidentiality, stale-write rejection, asset type and event scoping, JPEG-to-WebP cover and monogram upload, private published artwork retrieval, revoked guest delivery after reset, verified media uploads, and gallery, guestbook and ceremony integration. Synthetic artwork and upload fixtures were removed.
- Verified the restarted loopback demo in Chrome. Its QR invitation opened the guest uploader with Christmas Elegance active. The local dashboard, Theme Studio and ceremony routes loaded with their owner access controls. Physical-device and public staging tests were outside this run.

## Voice WebM

- Reproduced Chrome's audio-only MediaRecorder output being identified as a WebM video container by the generic detector. The signature regression accepts a declared audio track and rejects video, mixed-track and truncated headers. A synthetic Chrome recording passed signed staging R2 upload and durable receipt verification, then appeared as pending audio in the demo database. The synthetic R2 objects were removed.

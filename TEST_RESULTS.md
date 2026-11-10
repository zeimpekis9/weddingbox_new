# Release verification

## Gates

| Gate | Result | Evidence or required environment |
|---|---|---|
| Code complete for this milestone | PASS | Shared media dialog, responsive layouts, faster initial guest bundle, upload recovery feedback, owner operational status, and staging R2 harness. |
| Local checks | PASS | Next.js production build, TypeScript, lint, 13 unit tests, PostgreSQL HTTP and SQL integration, seeded restore, and zero production dependency advisories. |
| Browser checks | PASS | Chrome 157 and WebKit 27.2 passed workflow and responsive suites. Captured 144 screenshots across both engines. |
| Physical device checks | NOT RUN | iOS Safari and Android Chrome on actual phones were unavailable. Local browser tests simulate touch, mobile user agents and viewport sizes. |
| Live R2 | NOT RUN | Isolated HTTPS staging, private bucket, worker and synthetic media fixtures required. |
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

The final loopback run returned HTTP 200 for every request. Page bursts of 100, 300 and 500 had p95 latencies of 384, 842 and 1,482 ms. A 100-request guest bootstrap burst had p95 of 178 ms. These results do not measure concurrent live media transfers.

## Repeat on isolated staging

Run `node --test tests/integration/staging-r2.test.mjs` with `WEDDING_STAGING_CONFIRM=isolated-staging`, `WEDDING_STAGING_URL`, `WEDDING_STAGING_EVENT`, `WEDDING_STAGING_OTHER_EVENT`, `WEDDING_STAGING_LINK`, `WEDDING_STAGING_ADMIN_COOKIE`, `WEDDING_STAGING_PHOTO`, and `WEDDING_STAGING_VIDEO`. Use synthetic JPEG and MP4 files, an active worker and an enabled gallery. The MP4 must be at least 32 MiB. Supply the short-lived credentials through the staging secret mechanism. Use a disposable test event, since the test leaves its verified fixtures available for inspection. It exercises CORS, direct transfer, resumed multipart, receipt replay, private originals, cross-event denial, checksums and thumbnail delivery.

Use [the recovery and performance plan](PERFORMANCE_AND_RECOVERY_PLAN.md) for independent restore and representative load. Verify the native file picker, microphone and Safari media playback on physical devices before the release gate.

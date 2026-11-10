# Delivery progress

Commit references identify the implementation under test. Milestone updates travel with their code.

- [x] M0 — Main branch synchronization | PASS | Foundation fast-forwarded onto main | Commit 4d6ee1d | Build, TypeScript, lint, unit and PostgreSQL integration PASS | Blockers none
- [x] M1 — PostgreSQL infrastructure | PASS | Compose, versioned migrations and restart persistence | Commit 4d6ee1d | Database, membership, restart PASS | Blockers none
- [x] M2 — Admin authentication and event authorization | PASS | PostgreSQL sessions, TOTP replay prevention and event isolation | Commit c14345f | Build, types, lint, unit, SQL and HTTP integration PASS | Live owner enrollment pending
- [x] M3 — Cloudflare R2 verified uploads | PASS | Signed single and multipart transfer, scoped grants and verified receipts | Commit 6fce7b8 | Local app to live EU R2 PASS. See M13 | HTTPS staging NOT RUN
- [x] M4 — Guest upload experience | PASS | QR download, bilingual upload, bounded concurrency and resume | Commit ce9f3d7 | Build, types, lint, unit, Chrome with mocked storage and HTTP integration PASS | Live Safari and R2 UNVERIFIED
- [x] M5 — Private gallery and guestbook | PASS | Scoped gallery, text and voice capture, approval filtering | Commit 44ab637 | Build, types, lint, unit, browser and PostgreSQL HTTP integration PASS | Live playback and browser microphone UNVERIFIED
- [x] M6 — Admin dashboard and moderation | PASS | Role-based event settings, statistics, previews and audit | Commit 5710745 | Build, types, lint, unit, browser and PostgreSQL moderation integration PASS | R2 preview and operator enrollment UNVERIFIED
- [x] M7 — Ceremony slideshow and live messages | PASS | Authorized approved feed, fullscreen and reconnect cache | Commit bc95bb3 | Build, types, lint, unit, browser disconnect and PostgreSQL HTTP integration PASS | Live R2 preview playback UNVERIFIED
- [x] M8 — Backups, monitoring and recovery | PASS | Local restore, health, upload-only mode, leased thumbnails and archives | Commit 1e2ea6f | Build, types, lint, ZIP integrity, worker lease recovery, local restore and browser PASS | Independent backup, alert routing and live R2 UNVERIFIED
- [ ] M9 — Performance and security testing | BLOCKED | Security headers, local request bursts and staging k6 harness | Commit fbabf40 | Build, types, lint, browser, HTTP and k6 inspect PASS; representative load NOT RUN | Needs isolated staging R2, TLS host and venue test
- [ ] M10 — Production readiness | BLOCKED | Linux image and seeded restore | Commit a1d61bc | Local build, restore and local app to live EU R2 PASS | Needs isolated HTTPS staging, independent backup and deployment approval
- [x] M11 — Supabase runtime removal | PASS | PostgreSQL and R2 workflows are the default | Commit 500be58 | Zero-config Linux build and startup, types, lint, 13 unit tests, Chrome network check, PostgreSQL integration and restore PASS | Blockers none

- [x] M12 — Responsive UI and release verification | PASS | Guest, owner, gallery and ceremony polish plus live R2 harness | Commit 2f2e452 | Build, types, lint, unit, PostgreSQL, seeded restore, Chrome and WebKit PASS | Physical devices, live R2, independent restore, capacity and deployment remain open. See TEST_RESULTS.md.
- [x] M13 — Live EU R2 integration | PASS | Local app to EU staging bucket | Commit 6eab2f8 | Signed JPEG and multipart, CORS, integrity, retry, isolation and cleanup PASS | HTTPS staging and worker NOT RUN
- [ ] M14 — Comprehensive pre-production drill | BLOCKED | Windows browser, R2, worker crash/ZIP, local PostgreSQL restart/restore and load smoke | App baseline d83c406 | Build, types, lint, unit, API, Chrome, WebKit and synthetic drills PASS | Restricted HTTPS, phones, independent restore and representative capacity NOT RUN
- [x] M15 — Isolated local Demo Wedding | PASS | CLI owner bootstrap with required password and MFA, synthetic gallery and loopback QR | App baseline 8442d9d | Unit, Chrome, PostgreSQL and staging R2 PASS | User enrollment pending on the running demo

Legacy data preservation is unconfirmed. Mark migration NOT REQUIRED only after the owner confirms that no irreplaceable records or media exist. Source inventory is optional and does not block development.

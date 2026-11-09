# Performance and recovery plan

All thresholds are proposed release gates, pending staging measurements and owner sign-off. No capacity results exist. Test a production-like TLS host, pinned PostgreSQL/Next versions, dedicated R2 staging with matching settings, dedicated test event plus isolation canary, independent generators and explicit cost/cleanup bounds. Use synthetic originals and expected checksums. Record git SHA, topology, host sizing, dataset, browser versions, limits and exact commands. Measure from Athens and venue networks as well as from load agents.

## Scenarios and thresholds

| Scenario | Method and evidence |
|---|---|
| 100, 300, 500 active guests | k6 ramp then 20 minutes per plateau with a fixed mix of uploaders, viewers and idle think time; separate 60-minute 500 soak, rotate synthetic sessions and record transferred bytes. |
| 500 page loads / 100 upload starts | Independent open arrival scenarios, 500 loads in 10 seconds and 100 starts in 5 seconds. Report offered/achieved rates and zero dropped iterations due to generator undercapacity. |
| Mixed payload | Initial workload 80% 3–12 MiB photos, 20% 40–150 MiB videos, with isolated 500 MiB boundary tests. Real R2 transfers plus photos, guestbook, gallery and display concurrently. |
| Slow and interrupted mobile | Browser/network shaping at 2 Mbps up, 150 ms RTT, 1% loss. Disconnect at part boundary and after Complete; restart browser, reselect, then assert receipt, identical hash and skipped completed parts. Real iOS Safari and Android Chrome devices, older phone, permission denial and orientation change. |
| Export and processing under load | Run P1 ZIP with mixed originals while peak workload runs. Verify ZIP64 manifest and exact bytes; compare API latency and queue. Separately crash worker mid-preview/export. |
| Security and consistency | Two events, two owners, moderator and guest roles; signed PUT replay, forged completion, wrong event/part/key, oversized/truncated/polyglot files, revoked capability, row updates during display playback. Zero unauthorized access or unapproved display content. |

For representative 500 runs, propose bootstrap/API p95 ≤300 ms, p99 ≤1 s, init p95 ≤500 ms, completion verification p95 ≤3 s for small files after final byte (multipart p95 ≤10 s under healthy conditions). Report p50 as well. Valid upload init ≥99.5%, healthy end-to-end upload completion ≥99% within workload timeout (size/bandwidth plus retry allowance), unexpected API 5xx <0.5%, no false receipts, duplicates, hash mismatches or unexplained failures. Measure raw throughput and p95 time per size cohort with client bandwidth as denominator, and require ≥70% shaped uplink utilization during active transfer for large files. Capture queue depth, p95 start delay <60 s for thumbnails at steady load, drain within 15 min after burst, approved display freshness ≤15 s online, DB pool wait p95 <50 ms, max connections <80% budget, sustained CPU <80%, memory <80% cap, storage error/retry counts, CDN cache hit/latency for public static assets and zero cross-event cache hits. Report throttles, client abandons and outages separately without excluding otherwise eligible failures from the healthy denominator. [k6 arrival executors](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/)

## Failure exercises

| Fault | Recovery behavior to prove |
|---|---|
| API crash or deployment during PUT | Data transfer keeps going with valid presign; new instance loads persisted session, refreshes URL and returns same receipt. |
| Worker crash | Lease expiry allows replay; stale lease cannot publish results. Separate preview/export resources. |
| DB outage | Stop minting new presigns, return retriable 503; existing transfers can continue. Recover leases and finalize same session after DB resumes. |
| R2 timeout or failed request | Retry bounded with jitter, verify ambiguous Complete/Put with origin HEAD and reconcile persisted state. |
| Mobile disconnect or interrupted video | Persist metadata, retain provider parts, safe reselect and resume, validate fingerprint and final content. |
| Congested Wi-Fi or simultaneous retries | Reduce client parallelism, jitter, Retry-After, per-event/grant/device plus coarse IP budget. Venue rehearsal, accountless mobile data fallback if available. |
| Display disconnect | Keep last approved cached snapshot within bounded TTL, reconnect with revision, purge revoked/hidden entries on refresh. |
| ZIP failure | Retry from durable job, abort partial output, never publish incomplete archive. |
| Backup failure | Alert on lag/failures, replay independently and verify restore. Preserve primary acceptance where safe. |
| Quota, billing or spike | Admission by reserved bytes and provider state; pause exports/previews and use upload-only feature flag. If object storage cannot accept data, show honest retry guidance. Independently deployed fallback requires separate authorization and rehearsal. |

## Observability, backup and wedding operations

Log redacted request IDs, receipt state transitions, storage/DB/queue timings and retry reasons. Alert on receipt failure, completion backlog, quota, CPU, DB locks/pool, worker heartbeat, storage 429/5xx, backup lag and expiration. Run synthetic QR and small verified upload from a separate monitor. Limit metrics cardinality. Give owners a simple dashboard with counts and health, and assign a primary and backup operator.

Propose RTO ≤60 min and independent-copy RPO ≤15 min for DB and original objects during wedding hours. Measure both using DB WAL/base backups and incrementally replicated original/hash manifests. Nightly encrypted logical dumps complement PITR. Backup credentials and keys must survive loss of the primary host and account. Restore isolated infrastructure, choose manifest/DB watermark, replay WAL, reconcile originals beyond the DB watermark, verify all sampled/fixture hashes, count rows and verify owner access, gallery and uploads. Record elapsed time and actual lost/recovered window. Never delete original bytes that are newer than the restored database during reconciliation.

- **Before wedding:** rehearse actual QR and Wi-Fi at venue, test two owners and recovery codes, supported phones, gallery/display cache, canary completion, independent restore, capacity and alert delivery. Freeze changes with an owner-approved lead time.
- **During wedding:** observe receipts, upload failures, queue lag and backup; classify fault, enable upload-only as needed, communicate retry guidance to on-site operator, preserve evidence and avoid destructive repair.
- **After wedding:** stop new uploads at agreed time, reconcile receipt/object counts and hashes, verify exports and owner download, confirm independent backup before retention/deletion actions, and document measured outcomes in TEST_RESULTS.md.

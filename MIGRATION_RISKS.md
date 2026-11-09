# Migration risk register

| Risk | Priority | Control and release evidence |
|---|---|---|
| Existing public or cross-event exposure | P0 | Verify live policies and exposure with authorized synthetic probes. Target default deny, separate upload/gallery grants, composite relationships, no public bucket. Two-event denial matrix including Realtime and object reads. |
| False success, duplicate or orphan after retry | P0 | HEAD original, idempotent receipt, fencing, queue transaction and reconciliation. Inject commit/response loss and delayed retry. |
| Legacy data URL, missing bytes or replaced cover | P0 | Restricted manifest, SHA-256 source/destination, explicit exceptions and preserved forensic copy. |
| Rollback strands new uploads | P0 | Verified freeze, delta, watermark, forward recovery and tested reverse path if needed. Exercise rollback both before and after first write. |
| Shared venue NAT or weak uplink | P0 | Multi-signal limits, bounded transfer, venue drill, cellular comparison and resumable sessions. |
| Single host or backup failure | P0 | Independent encrypted destination, isolated replacement-host restore, alert on backup lag, test RPO/RTO. |
| Unsupported dependencies / build failure | P0 | Supported Next version and fresh dependency scan, offline reproducible build, baseline browser comparison. |
| Upload abuse and privacy | P0 | Quota reservations, signed narrow grants, exact content validation, logs redacted, privacy/retention review and key rotation exercise. |
| Formats, mobile quirks and background tabs | P0 | Real Safari/Chrome device tests, re-selection and checksum verification; publish supported format matrix. |
| Slow preview/export harms ingest | P0 | Separate worker pools and resource limits, upload-only switch, concurrency/load recovery rehearsal. |
| Anonymous signed link already issued at revoke | P0 | Brief expiries, current generation check at broker, revoke/purge tests, explicit TTL bound. |

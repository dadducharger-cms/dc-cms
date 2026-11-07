# Reliability and capacity

This application cannot promise zero missed conversations. It now provides stronger protection for events that reach its server, but remains a single-process SQLite application—not a certified high-availability production system.

## What is implemented

- Signed provider webhooks are acknowledged only after their raw payload has been committed to SQLite. `WAL` and `synchronous=FULL` are enabled.
- Background incoming processing is independent of slow outgoing network calls. Small batches run every 100 milliseconds; outgoing sends are capped at four simultaneous requests per channel with at most one per conversation.
- Provider messages are deduplicated. Replayed payloads and partial processing retries do not create another logical message or assignment.
- An individual failed event does not block later events. Backoff retries are bounded; after five failures the payload stays in quarantine for admin review and explicit retry.
- Queue health shows retained, pending, quarantined and outgoing-state counts across WhatsApp, Facebook and Instagram. It does not display raw secrets or provider payloads.
- Network ambiguity is surfaced as UNKNOWN, never silently retried. Automatic retry without provider idempotency could duplicate a customer's reply.
- Inbox queries are paginated, search happens on the server, and polling does not overlap. Unread markers use the last displayed message, so a concurrent arrival is not accidentally marked seen.
- Unassigned active conversations are assigned when an eligible agent becomes available.
- Managers can keep overdue initial conversations visible and escalate instead of auto-archiving. The original archive setting is preserved until changed.
- Graceful shutdown drains active provider requests before closing the database.
- `npm run backup` uses SQLite's backup API and verifies integrity. Backups are local and must be copied to protected off-machine storage and scheduled by deployment operations.

## Measured mixed-channel burst and crash recovery

Run `LOAD_CONCURRENCY=2000 LOAD_REPORT=docs/load-test-results.json npm run load-test` to reproduce. The default is 12,000 messages and 1,000 concurrent clients. Each run uses a temporary on-disk database and a separate server process; the live database and Meta are never contacted. The test sender signs real HTTP requests, retries failed attempts at most five times, and verifies every expected message ID and body, not just totals.

Observed on the development machine on 7 November 2026 (machine-readable evidence in `load-test-results.json`):

| Metric | Result |
| --- | --- |
| Unique inbound messages across WhatsApp / Facebook / Instagram | 12,000 |
| Conversations (two messages per customer per channel) | 6,000 |
| Concurrent clients | 2,000 |
| Duplicate message redeliveries in changed webhook envelopes | 1,200 |
| Successful HTTP acknowledgments, including redeliveries | 13,200 |
| Failed attempts retried by the synthetic sender | 4,310 |
| Pending messages before abrupt SIGKILL | 10,500 |
| Pending messages recovered after restart | 10,500 |
| Missing / duplicate logical messages | 0 / 0 |
| Unassigned conversations after drain | 0 |
| Original burst acknowledgments including retries | 2.88 seconds |
| Total including restart and queue drain | 10.89 seconds |
| p95 latency of successful HTTP attempts | 601.3 ms |
| Round-robin distribution | 2,000 / 2,000 / 2,000 |
| SQLite integrity and foreign-key checks | Passed |

Concurrency means in-flight client requests, not identical socket arrival times. Connection resets occurred during this deliberately aggressive local burst. Bounded sender retries were necessary; an unacknowledged attempt is not proof of persistence. The p95 value excludes failed-attempt time; the total burst duration includes retries. The listener now requests a 4,096-connection backlog, which the operating system may cap; this does not eliminate network failures.

### Regression scenarios

- Malformed first message followed by a healthy message within the same webhook, for all three Meta adapters: healthy siblings are saved exactly once; the original faulty payload remains retained and eventually quarantined. Previously processing stopped at the first malformed sibling.
- 1,000 website initial messages through HTTP, with 100 concurrent clients: the existing per-IP limit returns explicit 429 responses. The test retries unchanged request IDs after advancing an injected clock past each rate window; all 1,000 are saved once. This is a correctness test, not a website throughput measurement.
- All agents unavailable during those website arrivals: all conversations remain saved and unassigned. When two agents become available, the worker assigns 500 each and skips the unavailable third agent. Duplicate initial requests do not add conversations.
- Existing tests also cover slow outgoing transports, signature rejection, ambiguous sends, deadline recovery, and agent authorization.

This is a local synthetic benchmark, not a production SLA. It excludes actual Meta delivery/retry policies, public network behavior, media, disk exhaustion, hardware loss, and concurrent employee-browser workloads. A production host needs its own sustained load and failover tests.

## Before relying on it for the store's full volume

1. Run an extended mixed-channel soak test against the intended production host with concurrent agents, real provider credentials and representative attachments once supported.
2. Add production-grade HTTPS ingress, process supervision, external uptime/queue alarms, and off-host backups; test restoring to a clean server.
3. Move to PostgreSQL and a separately supervised queue/worker service before scaling to multiple application instances. The current SQLite queue claim scheme supports exactly one process.
4. Add provider reconciliation where supported, token-expiry monitoring, retention policies, and operational procedures for UNKNOWN sends and quarantined events.
5. Review public widget rate limits and proxy client-IP handling for the chosen deployment. They currently use the socket peer address; a reverse proxy can cause visitors to share a limit. A 429 is a rejection—not a stored message—and the widget displays failure while retaining the draft/request key for retry.
6. Test provider retry behavior during outages. The app cannot store a message that never reaches its server, and provider retry windows are outside the app's control.

## Backup and restore

- Create a consistent snapshot: `npm run backup -- /absolute/path/to/new-backup.sqlite`.
- To restore: stop the application, preserve the current database and its sidecars in a separate directory, then copy the chosen snapshot to `data/uocms.sqlite` in a clean data directory. Start one application instance and verify history, credentials, assignments and queue health.
- Do not overwrite an active database or mix a restored snapshot with old WAL/SHM files. Store snapshots securely: they contain customer conversations and account hashes.

If integration credentials were saved through the admin form, restore the protected `data/integration.key` together with the database. Keep the key backup separate and access restricted.

# Gaming Store product progress

This is one store's independent installation, not a shared multi-business service.

## Implemented and locally verified

- Actual supplied store logo, yellow/charcoal branding, persistent light/dark theme.
- Website chat; signed text adapters for WhatsApp, Facebook Messenger and Instagram Login API.
- Durable inbound queues, duplicate protection, bounded retries, quarantine/retry controls and queue health.
- Server-side inbox pagination/search, unread markers, unassigned filter and presence indicators in customer details.
- Customer profiles and admin-only manual cross-conversation linking; agent access remains limited to assigned conversations.
- Internal notes, priorities, tags, categories for availability, tracking, compatibility, warranty, returns and technical support.
- Shared saved replies with admin editing and insertion before sending.
- Manual customer order records: products, status, payment, shipping and warranty. These are not synchronized with an ecommerce system.
- Manager reports for workload, conversation states, unanswered/unassigned work, first-response averages and website satisfaction ratings.
- Configurable response durations and archive-versus-escalation behavior. Business hours are recorded for staff reference but do not pause timers.
- Agent creation, password changes with session revocation, account availability/deactivation, and management audit history.
- Consistent SQLite backups with integrity verification, isolated load test, and API/domain tests.

## Awaiting account/deployment information

- Real Meta permissions, credentials, webhook subscriptions, live inbound/outbound verification and account-specific limits.
- Order-system connector: identify the existing store platform/API and grant access before synchronization can be implemented and tested against it.
- Public HTTPS hosting, external monitoring/alerts, backup scheduling and off-machine storage.

## Remaining engineering before full production rollout

- Media attachment upload/download/rendering across channels; voice/video support; WhatsApp approved templates and supported extended-window workflows.
- PostgreSQL migration, separate queue workers, distributed throttling and multi-instance safety.
- Email-based password recovery, administrator MFA and comprehensive access/security review.
- Provider-history reconciliation, retention/deletion tooling, attachment scanning/storage and recovery procedures.
- Business-hour-aware timers and episode-based reporting beyond the current lifetime first-response metric.

These are deliberately listed as unfinished; mocked adapter tests are not live integration certification. The application must not be sold as a zero-loss or fully production-ready omnichannel service yet.

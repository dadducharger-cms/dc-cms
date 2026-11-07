# UOCSM - Daddu Charger

A runnable, local customer-support application based on the supplied UOCMS specification. Includes an agent inbox, protected admin tools, persistent conversation history, round-robin assignment, deadline processing, notifications, and an embeddable website chat.

## Run

Requires Node.js 24 or newer. No package installation or external services are required.

```sh
cd /Users/apple/Downloads/UOCMS
npm start
```

Open http://localhost:3000. On the first launch, the server prints a randomly generated initial password. It applies to the four seeded local accounts:

| Account | Role |
| --- | --- |
| admin@uocms.local | Administrator |
| aisha@uocms.local | Agent |
| bilal@uocms.local | Agent |
| sara@uocms.local | Agent |

Alternatively, set `INITIAL_PASSWORD` in the environment before the very first launch. It does not change existing passwords. Passwords are salted and hashed with scrypt. Sessions last 24 hours and are stored in SQLite. Signing out revokes the session; disabling a user immediately blocks their session on subsequent requests.

`PORT` defaults to 3000; `HOST` defaults to 127.0.0.1. `COOKIE_SECURE=true` enables secure cookies for an HTTPS deployment. The development server binds only to localhost by default.

## Try the complete flow

1. Sign in as admin and open **Open test chat**.
2. Send a customer message. The inbox refreshes within three seconds and assigns the first conversation to Aisha.
3. Open it and send a reply; the widget receives the reply within 2.5 seconds.
4. Sign in as Aisha in another browser session. She sees only her assigned conversations, with no channel metadata.
5. Close/reopen conversations, inspect activity history, reassign through the admin dropdown, or change team availability.
6. Use a different browser profile or clear the widget's local storage to simulate a different customer. Each widget browser session retains its conversation token.
7. Leave a new conversation unanswered for ten minutes to see it archive. Send another customer message to restore it. After an initial reply, an unanswered customer message produces hourly agent notifications.

One clearly named Demo Customer conversation may be present from browser verification.

## Website widget

The administrator's Integrations page provides the embed snippet:

```html
<script src="http://localhost:3000/embed.js" defer></script>
```

For a real website, replace localhost with the application's reachable HTTPS origin. The script creates a chat button and a cross-origin iframe; requests originate inside that iframe. Browser storage restrictions may prevent retaining sessions in some third-party embeds. `/widget` also works as a standalone page. Its bearer token grants access only to that visitor's conversation. The first message requires a random UUID v4 idempotency key; retries recover the original chat rather than creating duplicates.

## Implemented behavior

- `NEW → OPEN` on a support reply; `NEW → ARCHIVED` after ten minutes without a reply.
- Later messages during `NEW` do not extend the initial deadline.
- Customer messages restore `ARCHIVED` and `CLOSED` records as fresh `NEW` episodes, preserving history.
- Restored conversations keep eligible owners; otherwise they enter the round-robin rotation.
- An open conversation's latest customer message sets a one-hour reminder deadline. Additional customer messages reset it; replies and closure clear it.
- Repeated hourly reminders are recorded once per deadline. After downtime, the worker sends one catch-up reminder and schedules the next one an hour later.
- SQLite `BEGIN IMMEDIATE` transactions serialize assignment, state transitions, notification inserts, and deadline handling. Durable deadlines are scanned every second and immediately on startup.
- Agents can read/reply/close their own active conversations and reopen their assigned conversations. Only admins close archived conversations, reassign ownership, inspect source metadata, or manage accounts.
- No eligible agent leaves the conversation unassigned with an admin alert. An admin can assign it when someone becomes available; active unassigned conversations are assigned when an eligible agent becomes available.
- Admin archive alerts, agent response reminders, read/unread notification state, audit events, text search, status filters, and availability controls.
- Server authorization, same-origin write checks, HttpOnly/SameSite cookies, bounded requests, basic per-IP write/login limits, and safe text rendering.

## Verification

```sh
npm run check
npm test
```

Automated tests cover rotation/skipping, ten-minute expiry, reply invalidation, restoration, hourly repetition/reset, reply/closure cancellation, duplicate requests, private-field serialization, HTTP authorization, concurrent arrivals, website replies, CSRF origin rejection, logout revocation, and persisted deadline recovery. Tests use an injected clock and isolated databases; no hour-long waits are needed.

## Implementation and scope

This is a single-process, text-only local MVP. To run immediately without Docker, PostgreSQL, Redis, or dependencies, it uses Node's HTTP server and built-in SQLite with plain JavaScript/CSS. It does **not** implement the proposed Next.js/NestJS/PostgreSQL/BullMQ stack. The database is `data/uocms.sqlite` (ignored by Git). A one-second server worker replaces Redis scheduling; UI updates use short polling rather than WebSockets. Timers require the server to run; downtime is recovered at restart.

WhatsApp Business Cloud API is implemented for text messaging, signed webhooks, durable incoming/outgoing queues, and provider delivery updates. It requires Meta credentials and a public HTTPS callback before it can connect. See [WhatsApp setup](docs/WHATSAPP.md) and `.env.example`. Instagram and Facebook text adapters are also implemented but **not configured or live verified**. See [channel setup](docs/CHANNELS.md). WhatsApp media and approved template sending are not implemented. Website replies are committed to the database for the widget to fetch; `SENT` means made available to that widget, not confirmed read by a customer.

Before a production rollout: migrate storage/worker coordination to PostgreSQL and BullMQ if scaling beyond one node, add managed identity or account/password management, issue individual credentials, terminate HTTPS, complete remaining provider adapters, media, and template support, add durable distributed rate limiting, operational monitoring, backups, retention policies, pagination, and deployment-specific widget origin/privacy configuration. No production deployment has been performed.

## Source layout

- `server/store.js`: schema, transactions, lifecycle, assignment, serialization, timer worker logic.
- `server/index.js`: HTTP server, sessions, authorization, APIs, worker lifecycle, static serving.
- `public/app.js`, `public/styles.css`: responsive agent/admin application.
- `public/widget.js`, `public/widget.html`, `public/embed.js`: customer chat and embed.
- `test/workflows.test.js`: core and HTTP integration tests.

When backing up, stop the server and copy the database plus any SQLite WAL/SHM sidecars together, or use SQLite's backup API. Do not copy just the main file while writes are active.


## Store product improvements

See [product progress](docs/PRODUCT-PROGRESS.md) for implemented features and unfinished work, and [reliability](docs/RELIABILITY.md) for the measured 12,000-message mixed-channel burst and abrupt-crash recovery, recovery behavior and production limits.

The sidebar now includes saved replies, reports, queue health, store settings and account management. Open a conversation's **Customer details** to manage its support case, private notes, profile and manual order records. Business-hour text is informational; timers still run continuously. Admins can choose **Keep visible and alert manager** instead of archiving overdue initial conversations.

```sh
npm run load-test  # isolated synthetic load, no live customer data
npm run backup    # consistent snapshot plus integrity check
```

Additional implementation files: `server/product.js`, `server/social.js`, `public/product-ui.js`, and `scripts/`.

## Employee dashboard and integration guide

Home opens the role-scoped dashboard: admins see store totals, agents, channels and queue health; agents see only their currently assigned conversations and statistics. Authorization is enforced by the dashboard API.

Use the [integration guide](deliverables/UOCSM-Daddu-Charger-Integration-Guide.docx) for the separate Next.js storefront handoff and step-by-step Meta setup. Admins can configure channels in **Integrations → Configure connection** without editing server files. Saving credentials does not validate a live connection; complete the guide’s acceptance tests.

Stored integration credentials are encrypted with `data/integration.key`. Back up this restricted-access key separately alongside database backups; the database alone cannot restore saved credentials. Existing environment-based configuration remains supported.

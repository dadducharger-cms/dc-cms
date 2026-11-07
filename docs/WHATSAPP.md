# Connect WhatsApp Business Cloud API

The integration is implemented for one Meta business phone number. It is not connected until server credentials are configured and a real signed webhook is received. The existing Instagram and Facebook integrations remain unavailable.

## Values to supply

| Environment variable | Where it comes from / purpose |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Meta app's WhatsApp API Setup for testing, or a system-user access token assigned to the business's WhatsApp assets for ongoing use. Needs `whatsapp_business_messaging`; use `whatsapp_business_management` for account setup/subscription operations. |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp API Setup's **Phone number ID**, not the displayed phone number. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp API Setup / WhatsApp Manager's **WhatsApp Business Account ID (WABA ID)**. |
| `META_APP_SECRET` | Your Meta app's Settings → Basic → App secret. Used to authenticate webhook bodies. |
| `WHATSAPP_VERIFY_TOKEN` | A random secret you generate locally and enter identically in Meta's webhook configuration. This is not the access token. |
| `META_GRAPH_VERSION` | A supported Graph API version from your Meta application, formatted `vXX.0`. No version is silently assumed. |
| `PUBLIC_BASE_URL` | The application's public HTTPS origin, e.g. `https://support.example.com`. Localhost cannot receive callbacks from Meta. |

Keep the access token and app secret in the local `.env` file or deployment secret manager; do not paste them into chat or commit them. An App ID can help identify the correct Meta app, but is not needed by this adapter. No Facebook password, WhatsApp OTP, or two-step verification PIN is needed by this application.

## Configure

1. Copy `.env.example` to `.env` and populate the values. Generate a verification token using the command in that example. Restrict `.env` permissions to your user (`chmod 600 .env`).
2. Restart with `npm start`. Node loads `.env` automatically. The token never enters browser bundles or API responses.
3. Make the app reachable via a trusted HTTPS reverse proxy or an explicitly configured development tunnel. Set `PUBLIC_BASE_URL` to that origin and `COOKIE_SECURE=true` for HTTPS. Deployment/tunneling is not provisioned by this change.
4. In your Meta app's WhatsApp webhook configuration, set callback URL to `https://YOUR-HOST/webhooks/whatsapp`, and enter the same `WHATSAPP_VERIFY_TOKEN`. Verify and save.
5. Subscribe to the **messages** webhook field and ensure the Meta app is subscribed to the correct WABA. Ensure the sending number is registered for Cloud API. When using Meta's test number, add the intended test recipient in Meta's setup.
6. Send a WhatsApp text from your test recipient to the business number. It should appear in the inbox and receive round-robin assignment. Reply in the inbox and confirm arrival on the phone.
7. The admin Integrations card distinguishes missing credentials, configured/awaiting-webhook, and receiving-webhooks. Receiving webhooks does not prove outbound token validity; the real reply test completes that check.

## Supported behavior

- GET webhook verification and constant-time HMAC-SHA256 validation of raw POST bodies.
- Durable signed event receipt before acknowledgment, plus idempotent processing and provider-message deduplication.
- WABA and phone-number scoping; identities use business phone ID + customer ID and never automatically merge with website visitors.
- Incoming text, button titles, and interactive reply titles. Other inbound formats create a neutral placeholder so the conversation is not silently lost. Media download/rendering is not implemented.
- Queued outbound free-form text, provider acceptance, delivery/read/failure statuses. Pending or failed sends do not cancel response timers.
- The latest provider customer-message timestamp controls the 24-hour free-form reply check. Outside that window, replies are blocked with an actionable error. Approved template sending is not implemented yet.
- Provider IDs, customer transport IDs, errors, tokens, and source metadata stay out of agent responses. Agents see generic delivery statuses and errors.
- Network timeouts/crashes can leave the provider outcome uncertain. Such messages become `UNKNOWN` and are **not automatically resent**, avoiding duplicates. A later correlated receipt can resolve the status. Provider rejections become `FAILED`; the agent can compose another attempt after the admin fixes configuration. `CANCELED` means the conversation closed/archived, the window expired, or the configured number changed before dispatch.
- This remains a single-process SQLite MVP. Deploy one application process. Add multi-worker claiming, webhook retention/monitoring and encrypted backups before a broader production rollout. Webhook bodies are persisted as customer data in the local database.

## Verification

`npm test` includes mocked provider tests for challenge/signature rejection, webhook duplication, phone-number filtering, metadata privacy, queued reply idempotency, receipt ordering, API rejection, timeout ambiguity, expired reply windows, and a new inbound message racing an outgoing reply. No live Meta calls or customer messages are sent by the tests.

References: [Meta Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-eb9a6721-1056-4db2-b00a-2290e04b5b5d), [Meta webhook documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview).

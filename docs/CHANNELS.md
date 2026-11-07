# Messaging channels

All four channels feed the same conversation engine and remain platform-blind for agents. The three Meta adapters are installed but need real credentials, account permissions, HTTPS callbacks and live verification before use.

- Website: `/widget`; embed `/embed.js`. Works locally.
- WhatsApp Cloud API: see [WhatsApp setup](WHATSAPP.md).
- Facebook Messenger: configure `FACEBOOK_ACCOUNT_ID` (Page ID), `FACEBOOK_ACCESS_TOKEN` (Page access token), `FACEBOOK_APP_SECRET`, `FACEBOOK_VERIFY_TOKEN`, and `META_GRAPH_VERSION`. Callback: `/webhooks/facebook`. Grant the app the required Page messaging access and configure message/delivery/read webhook subscriptions in Meta.
- Instagram **with Instagram Login**: configure `INSTAGRAM_ACCOUNT_ID` (professional account ID), `INSTAGRAM_ACCESS_TOKEN` (Instagram user access token), `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN`, and `META_GRAPH_VERSION`. Callback: `/webhooks/instagram`. This adapter uses `graph.instagram.com`, not the Facebook Login/Page-token variant. Set up messaging permissions and subscriptions for that login path.

`PUBLIC_BASE_URL` supplies the HTTPS origin for callback display and same-origin checks. Missing configuration is shown only to admins. Each channel has its own durable incoming/outgoing queues, recovery state, and provider identities; identical external IDs do not merge different channels.

Current functionality: signed verification, text receipt/reply, deduplication, limited delivery/read receipt normalization, durable queues, retained failed events, and standard 24-hour text-reply window enforcement. Social replies are conservatively capped at 1,000 characters. Non-text incoming content is represented by an explicit placeholder. Media retrieval, attachment upload, interactive outbound messages, approved WhatsApp templates, extended-window message tags, comment/private-reply workflows, and reconciliation against provider history are not yet implemented. Do not advertise these as supported.

No live Meta verification has been performed. Mock tests verify payloads, scoping, signatures/receipt handling and state transitions, not app review approval, token validity or delivery to an actual device.

Primary API references:
- [Meta Messenger Send API](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api?entity=folder-22794852-6724e47b-0e25-4cb0-95cb-cd04279dd917)
- [Meta Instagram API](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-1ff01566-3509-48bd-a0f4-8571a91ccfdf)

# Deploy UOCSM - Daddu Charger on Render

This deploys the employee portal as one Node.js web service. The public Next.js storefront stays separate. Start with an empty production database; local demo conversations and accounts are not uploaded.

## From the screen showing service types

1. Select **New Web Service**, then **Git Provider**. Connect the GitHub account that can access `dadducharger-cms/dc-cms`. Grant Render access to this repository. A collaborator may need the repository owner to approve the Render GitHub App installation.
2. Select `dadducharger-cms/dc-cms`, branch `main`.
3. Enter these settings:

| Setting | Value |
| --- | --- |
| Name | `dc-cms` (or another available name) |
| Region | Singapore |
| Runtime / Language | Node |
| Root directory | Leave blank |
| Build command | `npm run check && NODE_ENV=test npm test` |
| Start command | `npm start` |
| Instance type | Starter paid instance for initial setup/testing |
| Instance count | 1 |
| Health check path | `/healthz` |
| Auto deploy | Off initially; deploy manually after reviewing changes |

Node 24.22.1 is selected by `.node-version`. The initial instance is not a production capacity guarantee: test the hosted app under representative load and increase resources if needed.

4. Add environment variables:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `COOKIE_SECURE` | `true` |
| `DATABASE_PATH` | `/var/data/uocms.sqlite` |
| `ADMIN_EMAIL` | The email address you want to use for admin login |
| `INITIAL_PASSWORD` | A unique password of 16–200 characters, saved in your password manager |

Enter secrets directly in Render, not GitHub or chat. Do not copy the local demo password. The email is a login identifier; email delivery and password-reset emails are not configured.

Do not set `PORT`; Render supplies it. The app automatically uses Render's `RENDER_EXTERNAL_URL` for its initial HTTPS origin. No Meta credentials are required to start.

5. Under **Advanced → Add Disk**, set:
   - Name: `dc-cms-data`
   - Mount path: `/var/data`
   - Size: `1 GB` initially; monitor usage and expand as needed.

The disk must be attached before the first launch. Only files under the mount path survive redeployments. This includes the database, WAL/SHM files and `integration.key`. A free service is unsuitable for this storage model.

6. Review the recurring service and disk charges displayed by Render, then select **Deploy Web Service** when ready to purchase/start it.
7. Wait for **Live**. Copy the actual HTTPS URL displayed by Render; do not assume the service name is the exact URL.

## First checks

1. Open `https://YOUR-RENDER-HOST/healthz`. Expect `{"ok":true}`.
2. Open the root URL and log in using `ADMIN_EMAIL` and `INITIAL_PASSWORD` from your Render settings. The old local accounts are not present.
3. In **Store settings**, create individual employee accounts. Mark eligible agents available in **Team members** before accepting customer chats.
4. Open **Open test chat**, send a clearly labeled test message, and reply from the inbox. Confirm the customer's widget receives the reply.
5. Sign in as an agent and confirm only their own conversations and statistics are visible.
6. Restart the Render service and confirm the account, test history and assignment remain. If they disappear, stop onboarding and correct the disk mount/database path.
7. After confirming login, remove `INITIAL_PASSWORD` from Render's environment. Existing accounts are preserved; changing that variable does not reset a password. Use the app's Account page to change your password. Keep the saved password in your password manager.

## Connect channels after the portal works

In the portal, use **Integrations → Configure connection**. Enter the actual public HTTPS support URL and channel-specific IDs/secrets. Follow `deliverables/UOCSM-Daddu-Charger-Integration-Guide.docx` for Meta asset subscriptions, permissions and inbound/reply verification.

Callbacks:
- WhatsApp: `https://YOUR-RENDER-HOST/webhooks/whatsapp`
- Facebook: `https://YOUR-RENDER-HOST/webhooks/facebook`
- Instagram: `https://YOUR-RENDER-HOST/webhooks/instagram`

The callback routes must remain reachable by Meta without staff login or a challenge page. Staff APIs remain authenticated. Webhooks validate provider signatures.

Give the Next.js developer `https://YOUR-RENDER-HOST/embed.js` and the guide's Next.js Script example. They install the widget on the separate storefront. Customer login and automatic order synchronization are not included.

For a custom support domain: add it in Render, enter the DNS records Render provides, wait for valid HTTPS, set `PUBLIC_BASE_URL` to that origin, and update saved integration URLs, Meta callbacks and the website embed. If an integration URL is already saved in the portal, update it in the portal as well; the saved setting takes precedence over the environment.

## Operations

- Keep exactly one running service instance. Do not create a second worker or enable horizontal autoscaling against this SQLite database.
- Disk-backed deploys can cause brief downtime. Check queue recovery and Meta redelivery after maintenance.
- A healthy `/healthz` checks HTTP serving and a database read; it does not certify disk space, successful delivery, or queue progress. Monitor Queue health and overdue/unassigned conversations too.
- Run `npm run backup -- /var/data/backups/backup-UNIQUE-DATE.sqlite` in the Render Shell to create a consistent, integrity-checked database snapshot. Use a new filename each time.
- Copy database backups off the service to protected storage, and separately protect `/var/data/integration.key`. Schedule backups and test restore before real customer traffic. Disk snapshots alone are not a substitute for a verified SQLite backup/restore procedure.
- Watch disk usage. Backups on the same disk consume its capacity; use a retention procedure after off-host copies are verified.
- Restore only with the service stopped, into a clean data directory; preserve the old files separately. Never mix old WAL/SHM sidecars with a restored database.
- The current website request limiter uses the socket peer IP. A hosting proxy can make visitors share a limit. Website 429 responses preserve the draft for retry, but production proxy-aware limiting still needs deployment-specific verification before high-volume website traffic. Meta webhook ingress is separate from this limiter.
- Meta text integrations still require live end-to-end tests. Media and WhatsApp templates remain unfinished.

## Alternative: Blueprint

The repository also contains `render.yaml`. Use **New → Blueprint**, connect the same repo, and enter the two prompted admin values to use it. Choose either manual Web Service setup or Blueprint, not both. Review the paid plan and disk before applying. The Blueprint is a checked-in configuration template, not evidence of a live deployment.

## Official references

- https://render.com/docs/web-services
- https://render.com/docs/disks
- https://render.com/docs/environment-variables
- https://render.com/docs/node-version
- https://render.com/docs/blueprint-spec

# Oracle Always Free deployment

This guide targets a **new Ubuntu 24.04 VM**. It runs one Node.js process under systemd, stores data outside the code directory, and uses Caddy for public HTTPS. These files are prepared but have not been run on your Oracle account.

## 1. Create the free VM

1. Sign up/sign in at https://cloud.oracle.com/. Complete Oracle's account/payment verification yourself. Select your home region carefully; Always Free resources must be created in the eligible home region.
2. Open **Compute → Instances → Create instance**. Name it `dc-cms`.
3. Choose **Canonical Ubuntu 24.04**, with an ARM-compatible image for Ampere A1.
4. Choose **VM.Standard.A1.Flex**, initially **1 OCPU and 6 GB RAM**. Confirm the shape is marked **Always Free eligible** in your account. Current Always Free documentation lists a total A1 allowance equivalent to 2 OCPUs and 12 GB RAM across the tenancy; other instances count toward this. Do not accidentally select a trial-only paid shape.
5. Use the default boot-volume size only if it fits your remaining Always Free storage allocation. Do not add paid backup policies, extra disks, or a load balancer for this setup. Review all displayed resource charges and eligibility before creating.
6. Create/select a VCN with a **public subnet**, an internet gateway, and a default route to that gateway. Enable a public IPv4 address for the VM.
7. Generate/download an SSH key pair, or upload your own public key. Keep the private key on your Mac; never put it in GitHub or chat.
8. Create the instance. Wait for **Running**, then copy its public IP.

If capacity is unavailable, try another availability domain in the same eligible home region or try later. Do not select paid resources merely to bypass capacity. Free resource availability and idle reclamation are controlled by Oracle, not this application.

## 2. Allow only the required inbound ports

In the subnet's Security List or an attached Network Security Group, add **stateful TCP ingress** rules with source ports set to All:

| Source | Destination port | Purpose |
| --- | --- | --- |
| Your current public IPv4 address followed by `/32` | 22 | SSH administration |
| `0.0.0.0/0` | 80 | HTTPS certificate validation and HTTP redirect |
| `0.0.0.0/0` | 443 | Employee portal, widget and signed webhooks |

Do not expose port 3000. Node listens only on loopback. Review any existing broad SSH rule; confirm restricted SSH works in a second terminal before removing a broader rule. Leave required egress available for updates, DNS, certificate issuance and Meta HTTPS calls.

## 3. Choose the portal hostname

The existing `dc-cms-mu.vercel.app` hostname belongs to Vercel. You cannot edit its DNS to point directly at Oracle. This deployment uses its own hostname.

- If you control the store domain: add an A record for a subdomain such as `support`, pointing to the VM public IPv4.
- Free alternative: sign in at https://www.duckdns.org/, choose an available name (for example `daddu-support.duckdns.org`), set its IPv4 to the VM IP, and save. This example name is not reserved for you. Do not share the DuckDNS token. Update the IP if Oracle later changes it.

Wait until `dig +short YOUR_HOSTNAME` on your Mac returns the VM's IP. Remove/correct an AAAA record if IPv6 is not configured. Use the same hostname consistently below. Caddy will obtain a certificate once DNS and inbound ports work.

## 4. Connect from your Mac

Replace the uppercase placeholders with your actual key path and public IP:

```sh
chmod 600 /path/to/YOUR_PRIVATE_KEY
ssh -i /path/to/YOUR_PRIVATE_KEY ubuntu@YOUR_VM_IP
```

The first connection asks you to verify the server host key. Validate its fingerprint using Oracle's console access if needed; do not bypass host-key checking. Ubuntu images use the `ubuntu` login.

## 5. Upload the committed application

On your **Mac**, open another terminal. This exports only Git-tracked files, excluding local databases, secrets, backups and `.git`. No GitHub credential needs to be installed on the VM.

```sh
cd /Users/apple/Downloads/UOCMS
git pull --ff-only
git archive --format=tar.gz --output=/tmp/dc-cms-release.tar.gz HEAD
scp -i /path/to/YOUR_PRIVATE_KEY /tmp/dc-cms-release.tar.gz ubuntu@YOUR_VM_IP:~/dc-cms-release.tar.gz
```

On the **VM**, run:

```sh
sudo mkdir -p /opt/dc-cms
sudo tar -xzf ~/dc-cms-release.tar.gz -C /opt/dc-cms
sudo bash /opt/dc-cms/deploy/oracle/install.sh
```

The installer supports ARM64 and x64, installs the pinned Node 24 release from nodejs.org after checksum verification, installs Caddy from its signed package repository, creates a restricted service user, and installs systemd units. It runs the test suite but does not start the portal or change firewall rules. Run it only on the new VM: the Caddy package starts its default web server when installed.

## 6. Configure the VM firewall

Oracle's Ubuntu image may also have host-level firewall rules. Inspect them:

```sh
sudo iptables -S INPUT
sudo ufw status
```

If UFW is active, use `sudo ufw allow 80/tcp` and `sudo ufw allow 443/tcp`. Preserve the SSH allowance. Do not enable a second firewall manager.

For the standard image with iptables and no active UFW, add only these rules, without flushing existing Oracle rules:

```sh
sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT || sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT || sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

If the package prompts to save existing rules, preserve them. If the VM uses a different firewall arrangement, stop and inspect that configuration rather than flushing rules. Both OCI network ingress and the VM firewall must allow 80/443.

## 7. Set your private production settings

On the VM:

```sh
sudo nano /etc/dc-cms.env
```

Keep the supplied NODE_ENV, HOST, PORT, COOKIE_SECURE and DATABASE_PATH values. Replace:

- `PUBLIC_BASE_URL=https://YOUR_HOSTNAME`
- `ADMIN_EMAIL=YOUR_ADMIN_EMAIL`
- `INITIAL_PASSWORD="YOUR_UNIQUE_PASSWORD"` — 16–200 characters. A password-manager-generated long alphanumeric password avoids environment-file quoting issues.

Do not leave any example values. Save with Ctrl+O, Enter, then exit with Ctrl+X. The file is root-only. Never paste its contents into support messages. No Meta secrets are needed yet.

Then configure HTTPS:

```sh
sudo nano /etc/caddy/Caddyfile
```

Replace its contents with this block, substituting your hostname (without `https://`):

```caddyfile
YOUR_HOSTNAME {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

## 8. Start and verify

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now dc-cms
curl --fail http://127.0.0.1:3000/healthz
sudo systemctl enable caddy
sudo systemctl reload caddy
sudo systemctl enable --now dc-cms-backup.timer
sudo systemctl start dc-cms-backup.service
sudo systemctl status dc-cms --no-pager
sudo systemctl list-timers dc-cms-backup.timer
```

The local health check should return `{"ok":true}`. Open `https://YOUR_HOSTNAME/healthz` on your Mac and confirm the same result with a valid certificate. Then open the root URL and log in with the configured admin credentials. The old localhost accounts are not copied.

If startup fails:

```sh
sudo journalctl -u dc-cms -n 60 --no-pager
sudo journalctl -u caddy -n 60 --no-pager
```

A certificate error usually means incorrect DNS, conflicting AAAA records, blocked 80/443, or an unreachable VM. Do not bypass browser certificate warnings.

## 9. Verify employee and chat workflows

1. Create individual employee accounts in Store settings. Mark available agents in Team members.
2. Open the test chat, send a clearly labeled test message, reply from the portal, and confirm arrival in the widget.
3. Sign in as an agent and confirm only assigned conversations and statistics appear.
4. Run `sudo systemctl restart dc-cms`; confirm login and chat history still exist. Then reboot once with `sudo reboot`, reconnect, and verify automatic startup and HTTPS.
5. After the initial admin login is confirmed, remove the INITIAL_PASSWORD line from `/etc/dc-cms.env`, then restart the portal. Existing credentials stay in the database. Change your password through Account when needed.
6. Check Queue health, unassigned conversations and disk usage before starting real customer traffic.

The website limiter currently uses the socket peer address. Behind Caddy, website visitors share the proxy's bucket; this can return 429 at volume. Test and implement trusted-proxy-aware limiting before a high-volume website launch. Meta ingress does not use that bucket. Do not simply trust arbitrary forwarded headers or disable abuse protection.

## 10. Backups and restoration

The included timer makes a consistent SQLite backup daily at **02:00 Asia/Karachi**, with up to five minutes of random delay. A missed run is caught up after startup. Files are under `/var/lib/dc-cms/backups`, with mode restricted by the service's umask. It checks database integrity. It does not automatically delete old backups.

These are local backups, not protection against VM/volume loss. Regularly copy a backup off the VM to protected storage, and separately protect `/var/lib/dc-cms/integration.key` after any integration is configured. The key is needed to decrypt saved Meta credentials. Do not commit either file to GitHub. Monitor `df -h` and manage retention after verifying off-host copies.

To export a chosen backup, make a private staging directory owned by ubuntu, copy exactly that snapshot using sudo, set owner to ubuntu and mode 600, then download with scp. Export the encryption key separately using the same restricted procedure; remove the staging files after download. Do not make the database or key world-readable.

Restore with the portal stopped. Preserve the existing data directory separately; place the backup at `/var/lib/dc-cms/uocms.sqlite` in a clean directory with its matching `integration.key`, owned by dc-cms and restricted. Do not combine a snapshot with old WAL/SHM files. Restart and verify accounts, history and queue health. Practice restoration before accepting real customer traffic.

## 11. Updates and integrations

For updates, first run a backup and retain the prior code archive. Upload a new tracked-files archive as in step 5. Stop dc-cms, replace the code directory with the new release, keep `/var/lib/dc-cms` and `/etc/dc-cms.env` intact, apply any documented unit/runtime changes, then start and check health. Restoring old code may also require a matching database snapshot after a schema change. Keep one process only.

Once HTTPS and persistence work, follow the integration guide in `deliverables/`:

- WhatsApp callback: `https://YOUR_HOSTNAME/webhooks/whatsapp`
- Instagram callback: `https://YOUR_HOSTNAME/webhooks/instagram`
- Facebook callback: `https://YOUR_HOSTNAME/webhooks/facebook`
- Next.js developer's widget script: `https://YOUR_HOSTNAME/embed.js`

Configure these from the portal's admin Integration forms, then complete real inbound/reply tests. The public Next.js storefront may remain on Vercel. Media and WhatsApp template support remain unfinished.

## References

- Oracle limits and reclamation: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Instance creation: https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm
- Caddy installation: https://caddyserver.com/docs/install
- Caddy HTTPS: https://caddyserver.com/docs/automatic-https
- Free DNS: https://www.duckdns.org/about.jsp

Oracle eligibility, regional capacity, storage/network allowances and account conditions determine whether your resources remain free. Verify the console before creation; trial credits are not the same as Always Free. Monitor account usage and keep off-host backups because free idle compute may be reclaimed.

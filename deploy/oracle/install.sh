#!/usr/bin/env bash
# Run on a NEW Ubuntu 24.04 Oracle VM after extracting this repository to /opt/dc-cms.
# Installs dependencies and service units; does not open ports or start the portal.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
source /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || { echo 'This installer supports Ubuntu 24.04 only.' >&2; exit 1; }
cd /opt/dc-cms
[[ -f server/index.js ]] || exit 1
apt-get update
apt-get install -y curl ca-certificates xz-utils gnupg debian-keyring debian-archive-keyring apt-transport-https
case "$(uname -m)" in aarch64) arch=arm64;; x86_64) arch=x64;; *) echo 'Unsupported architecture'; exit 1;; esac
version="$(cat .node-version)"
[[ $version =~ ^24\.[0-9]+\.[0-9]+$ ]] || { echo 'Expected pinned Node 24 version'; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
archive="node-v${version}-linux-${arch}.tar.xz"
curl --fail --show-error --silent --location "https://nodejs.org/dist/v${version}/${archive}" -o "$work/$archive"
curl --fail --show-error --silent --location "https://nodejs.org/dist/v${version}/SHASUMS256.txt" -o "$work/SHASUMS256.txt"
(cd "$work"; grep " ${archive}$" SHASUMS256.txt | sha256sum --check --strict)
mkdir -p /opt/node
 tar -xJf "$work/$archive" -C /opt/node
ln -sfn "/opt/node/node-v${version}-linux-${arch}/bin/node" /usr/local/bin/node
ln -sfn "/opt/node/node-v${version}-linux-${arch}/bin/npm" /usr/local/bin/npm
curl --fail --show-error --silent --location https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o "$work/caddy.key"
gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg "$work/caddy.key"
curl --fail --show-error --silent --location https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
chmod a+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy
id dc-cms >/dev/null 2>&1 || useradd --system --user-group --home-dir /var/lib/dc-cms --shell /usr/sbin/nologin dc-cms
install -d -m 700 -o dc-cms -g dc-cms /var/lib/dc-cms
# Application code stays root-owned and read-only to the service account.
chown -R root:root /opt/dc-cms
chmod -R a+rX /opt/dc-cms
if [[ ! -e /etc/dc-cms.env ]]; then install -m 600 deploy/oracle/environment.example /etc/dc-cms.env; fi
install -m 644 deploy/oracle/dc-cms.service deploy/oracle/dc-cms-backup.service deploy/oracle/dc-cms-backup.timer /etc/systemd/system/
systemctl daemon-reload
NODE_ENV=test /usr/local/bin/npm test
printf '\nInstalled. Configure /etc/dc-cms.env and /etc/caddy/Caddyfile using docs/ORACLE-DEPLOYMENT.md before starting.\n'

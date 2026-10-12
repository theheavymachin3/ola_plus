#!/usr/bin/env bash
# Proves the ola-plus package installs over the Debian `ola` package the way it will on a
# Raspberry Pi, keeps the configuration, runs, serves the UI with no flags, and rolls back.
# Meant to run inside a 32-bit ARM Debian trixie container (see the deb-test CI job):
#   test-install.sh <dir containing ola-plus_*.deb> <repo checkout>
set -euo pipefail

DEB_DIR=${1:?directory with the .deb}
REPO=${2:?repo checkout}
export DEBIAN_FRONTEND=noninteractive

step() { printf '\n== %s\n' "$*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
installed() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q '^install ok installed'; }

# A container has no init, so never let packages try to start services.
printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d
chmod +x /usr/sbin/policy-rc.d

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl jq procps util-linux

step "start from the Debian packages, as on the Raspberry Pi"
apt-get install -y --no-install-recommends ola
installed ola || fail "Debian ola did not install"
getent passwd olad > /dev/null || fail "no olad user from the Debian package"
mkdir -p /etc/ola
echo "enabled = false" > /etc/ola/ola-artnet.conf   # a setting the switch must keep
chown -R olad:olad /etc/ola

step "install ola-plus over it"
apt-get install -y --no-install-recommends "$DEB_DIR"/ola-plus_*.deb
installed ola-plus || fail "ola-plus is not installed"
installed ola && fail "Debian ola should have been replaced"
installed libola1t64 && fail "Debian libola1t64 should have been replaced"
[ "$(cat /etc/ola/ola-artnet.conf)" = "enabled = false" ] || fail "configuration was not kept"
echo "/etc/ola is $(stat -c '%U:%G %a' /etc/ola); olad groups: $(id -nG olad)"
id -nG olad | tr ' ' '\n' | grep -qx dialout || fail "olad is not in dialout"

step "installed files"
for f in /usr/bin/olad /usr/bin/ola_dev_info /usr/lib/systemd/system/olad.service \
         /usr/lib/udev/rules.d/60-ola.rules /usr/share/olad/www/landing.html \
         /usr/share/olad/www/ui/index.html /usr/share/olad/www/ui/manifest.webmanifest; do
  [ -e "$f" ] || fail "missing $f"
done
ldd /usr/bin/olad | grep "not found" && fail "olad has unresolved libraries"
olad --version
grep -q '^ExecStart=/usr/bin/olad' /usr/lib/systemd/system/olad.service || fail "unit has no ExecStart"
dpkg -L ola-plus | grep -E 'ola-plus|olad.service|60-ola.rules' | head

step "run olad as the olad user with the installed defaults (no --ui-dir)"
nohup runuser -u olad -- /usr/bin/olad --config-dir /etc/ola --log-level 3 > /tmp/olad.log 2>&1 &
for _ in $(seq 1 90); do
  curl -sf http://127.0.0.1:9090/json/server_stats > /dev/null && break
  sleep 1
done
curl -sf http://127.0.0.1:9090/json/server_stats > /dev/null || { cat /tmp/olad.log; fail "olad did not come up"; }
bash "$REPO/ui/ci/smoke-ui-hosting.sh" http://127.0.0.1:9090 || fail "UI hosting checks failed"
ola_dev_info | head -5

step "shared UI documents are written to the kept config directory"
curl -sf -X POST -d 'k=deb-test&rev=0&d=[1]' http://127.0.0.1:9090/ui_store | jq -e '.ok == true'
curl -sf 'http://127.0.0.1:9090/json/ui_store?k=deb-test' | jq -e '.rev == 1'
[ -f /etc/ola/ola-ui-deb-test.json ] || fail "document not written under /etc/ola"
stat -c '%U:%G' /etc/ola/ola-ui-deb-test.json
pkill -x olad || true
sleep 2

step "roll back to the Debian package"
apt-get remove -y ola-plus
installed ola-plus && fail "ola-plus should be removed"
apt-get install -y --no-install-recommends ola
installed ola || fail "could not reinstall Debian ola"
[ "$(cat /etc/ola/ola-artnet.conf)" = "enabled = false" ] || fail "configuration lost on rollback"
[ -f /etc/ola/ola-ui-deb-test.json ] || fail "shared documents lost on rollback"
echo "OK"

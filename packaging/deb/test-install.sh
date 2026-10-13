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
kept() { grep -qx 'enabled = false' /etc/ola/ola-artnet.conf; }
kept || fail "configuration was not kept"
echo "/etc/ola is $(stat -c '%U:%G %a' /etc/ola); olad groups: $(id -nG olad)"
id -nG olad | tr ' ' '\n' | grep -qx dialout || fail "olad is not in dialout"

step "installed files"
for f in /usr/bin/olad /usr/bin/ola_dev_info /usr/lib/systemd/system/olad.service \
         /usr/lib/systemd/system/ola-plus-sysinfo.service /usr/lib/ola-plus/firmware-stats.sh \
         /usr/lib/udev/rules.d/60-ola.rules /usr/share/olad/www/landing.html \
         /usr/share/olad/www/ui/index.html /usr/share/olad/www/ui/manifest.webmanifest; do
  [ -e "$f" ] || fail "missing $f"
done
ldd /usr/bin/olad | grep "not found" && fail "olad has unresolved libraries"
olad --version
grep -q '^ExecStart=/usr/bin/olad' /usr/lib/systemd/system/olad.service || fail "unit has no ExecStart"
dpkg -L ola-plus | grep -E 'ola-plus|olad.service|60-ola.rules' | sed -n '1,10p'

step "maintainer scripts drive systemd as intended (with a fake systemctl)"
# A container has no systemd, so pretend: a fake systemctl records what the scripts ask of it.
mkdir -p /run/systemd/system /tmp/fakebin
cat > /tmp/fakebin/systemctl <<'EOF2'
#!/bin/sh
echo "systemctl $*" >> /tmp/systemctl.log
EOF2
chmod +x /tmp/fakebin/systemctl
script() { # <script> <args...>: run an installed maintainer script, return what it asked systemctl
  : > /tmp/systemctl.log
  s=$1; shift
  PATH=/tmp/fakebin:$PATH sh "/var/lib/dpkg/info/ola-plus.$s" "$@" > /dev/null
  cat /tmp/systemctl.log
}
out=$(script prerm upgrade 99.0)
echo "prerm upgrade -> [$out]"
echo "$out" | grep -q "stop" && fail "prerm must not stop olad on an upgrade (that is what made the pause a minute long)"
out=$(script postinst configure 0.0.1)
echo "postinst configure (upgrade) -> [$(echo $out)]"
echo "$out" | grep -q "restart olad.service" || fail "postinst must restart olad after an upgrade"
out=$(script prerm remove)
echo "prerm remove -> [$(echo $out)]"
echo "$out" | grep -q "stop olad.service" || fail "prerm must stop olad when the package is removed"
echo "$out" | grep -q "disable olad.service" || fail "prerm must disable olad when the package is removed"
rm -rf /run/systemd/system /tmp/fakebin /tmp/systemctl.log

step "firmware reader writes what vcgencmd says (with a fake vcgencmd)"
mkdir -p /tmp/fakevc
cat > /tmp/fakevc/vcgencmd <<'EOF2'
#!/bin/sh
case "$1 $2" in
  "measure_volts core") echo "volt=1.2000V" ;;
  "measure_volts sdram_c") echo "volt=1.2000V" ;;
  "measure_volts sdram_i") echo "volt=1.2000V" ;;
  "measure_volts sdram_p") echo "volt=1.2250V" ;;
  "get_throttled ") echo "throttled=0x50005" ;;
  "measure_clock arm") echo "frequency(48)=600062000" ;;
esac
EOF2
chmod +x /tmp/fakevc/vcgencmd
OLA_PLUS_FIRMWARE_FILE=/tmp/fw-test.txt OLA_PLUS_FIRMWARE_INTERVAL=1 VCGENCMD=/tmp/fakevc/vcgencmd \
  /usr/lib/ola-plus/firmware-stats.sh &
reader=$!
for _ in $(seq 1 10); do [ -s /tmp/fw-test.txt ] && break; sleep 1; done
kill "$reader" || true
cat /tmp/fw-test.txt
grep -qx "volts_core=1.2000" /tmp/fw-test.txt || fail "core voltage missing"
grep -qx "volts_sdram_p=1.2250" /tmp/fw-test.txt || fail "sdram_p voltage missing"
grep -qx "throttled=0x50005" /tmp/fw-test.txt || fail "throttled flags missing"
grep -qx "arm_clock_hz=600062000" /tmp/fw-test.txt || fail "arm clock missing"
grep -q "^updated=[0-9]" /tmp/fw-test.txt || fail "timestamp missing"
rm -rf /tmp/fakevc

step "run olad as the olad user with the installed defaults (no --ui-dir)"
nohup runuser -u olad -- /usr/bin/olad --config-dir /etc/ola --log-level 3 > /tmp/olad.log 2>&1 &
for _ in $(seq 1 90); do
  curl -sf http://127.0.0.1:9090/json/server_stats > /dev/null && break
  sleep 1
done
curl -sf http://127.0.0.1:9090/json/server_stats > /dev/null || { cat /tmp/olad.log; fail "olad did not come up"; }
bash "$REPO/ui/ci/smoke-ui-hosting.sh" http://127.0.0.1:9090 || fail "UI hosting checks failed"
curl -sf http://127.0.0.1:9090/json/system_stats > /tmp/system_stats.json
cat /tmp/system_stats.json; echo
jq -e '.platform != null and (.load | length == 3) and .mem_total_kb > 0 and .uptime_s >= 0' /tmp/system_stats.json \
  || fail "system_stats is missing basics"
# (Read it all: with pipefail, `| head` can end the producer early and fail the script.)
ola_dev_info > /tmp/dev_info.txt
sed -n '1,8p' /tmp/dev_info.txt

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
# olad rewrites plugin settings when it starts (adding defaults), so check the setting, not the file.
echo "--- /etc/ola/ola-artnet.conf after the rollback:"; cat /etc/ola/ola-artnet.conf
kept || fail "configuration lost on rollback"
[ -f /etc/ola/ola-ui-deb-test.json ] || fail "shared documents lost on rollback"
echo "OK"

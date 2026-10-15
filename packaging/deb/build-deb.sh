#!/usr/bin/env bash
# Build the ola-plus .deb from a staged `make install` tree and a built web UI.
#
#   build-deb.sh <stage-dir> <ui-dist-dir> <version> <arch> <out-dir> [strip-command]
#
# <stage-dir> is the DESTDIR of `make install` configured with
#   --prefix=/usr --sysconfdir=/etc --localstatedir=/var --libdir=/usr/lib/<multiarch>
# so the files land where the Debian ola package puts them and replace it cleanly.
set -euo pipefail

if [ $# -lt 5 ]; then
  sed -n '2,8p' "$0"
  exit 2
fi
STAGE=$(cd "$1" && pwd)
UI=$(cd "$2" && pwd)
VERSION=$3
ARCH=$4
OUT=$5
STRIP=${6:-strip}
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)

[ -x "$STAGE/usr/bin/olad" ] || { echo "no usr/bin/olad in $STAGE (wrong prefix?)" >&2; exit 1; }
[ -f "$UI/index.html" ] || { echo "no index.html in $UI" >&2; exit 1; }

ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
cp -a "$STAGE"/. "$ROOT"/

# Runtime only: drop headers, static and libtool archives, pkg-config files.
rm -rf "$ROOT/usr/include" "$ROOT"/usr/lib/pkgconfig "$ROOT"/usr/lib/*/pkgconfig
find "$ROOT" -name '*.la' -delete -o -name '*.a' -delete

# The web UI sits next to the classic one; olad finds <data dir>/ui by itself.
install -d "$ROOT/usr/share/olad/www/ui"
cp -a "$UI"/. "$ROOT/usr/share/olad/www/ui/"

install -D -m 0644 "$HERE/olad.service" "$ROOT/usr/lib/systemd/system/olad.service"
install -D -m 0644 "$HERE/ola-plus-sysinfo.service" "$ROOT/usr/lib/systemd/system/ola-plus-sysinfo.service"
install -D -m 0755 "$HERE/firmware-stats.sh" "$ROOT/usr/lib/ola-plus/firmware-stats.sh"
install -D -m 0644 "$HERE/ola-plus-net.service" "$ROOT/usr/lib/systemd/system/ola-plus-net.service"
install -D -m 0755 "$HERE/wifi-switch.sh" "$ROOT/usr/lib/ola-plus/wifi-switch.sh"
install -D -m 0644 "$REPO/debian/ola.udev" "$ROOT/usr/lib/udev/rules.d/60-ola.rules"
install -d -m 0755 "$ROOT/etc/ola"

DOC="$ROOT/usr/share/doc/ola-plus"
install -d "$DOC"
cp "$REPO/COPYING" "$DOC/COPYING"
cp "$REPO/LICENCE" "$DOC/LICENCE" 2>/dev/null || true
cat > "$DOC/copyright" <<'EOF'
OLA Plus is a fork of the Open Lighting Architecture (https://github.com/OpenLightingProject/ola)
with a new web UI and extra olad endpoints. It is distributed under the same licences as OLA:
the libraries under the GNU LGPL 2.1 or later, the programs under the GNU GPL 2 or later.
The full texts are in COPYING and LICENCE next to this file, and in /usr/share/common-licenses.
EOF
printf 'ola-plus (%s) unstable; urgency=medium\n\n  * Automated build from %s.\n\n -- OLA Plus <noreply@users.noreply.github.com>  %s\n' \
  "$VERSION" "$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo unknown)" "$(date -R)" \
  | gzip -9n > "$DOC/changelog.gz"

# Smaller package: strip debug info from our own binaries and libraries.
find "$ROOT/usr/bin" "$ROOT/usr/lib" -type f \( -perm -u+x -o -name '*.so*' \) \
  -exec sh -c 'file -b "$1" | grep -q "^ELF" && "$2" --strip-unneeded "$1"' _ {} "$STRIP" \; 2>/dev/null || true

# Debian wants man pages compressed.
find "$ROOT/usr/share/man" -type f -name '*.[0-9]' -exec gzip -9n {} +

SIZE=$(du -sk "$ROOT" | cut -f1)
install -d "$ROOT/DEBIAN"
sed -e "s/@VERSION@/$VERSION/" -e "s/@ARCH@/$ARCH/" -e "s/@SIZE@/$SIZE/" \
  "$HERE/control.in" > "$ROOT/DEBIAN/control"
for s in postinst prerm postrm; do install -m 0755 "$HERE/$s" "$ROOT/DEBIAN/$s"; done
(cd "$ROOT" && find . -type f -not -path './DEBIAN/*' -print0 | sort -z | xargs -0 md5sum | sed 's#  \./#  #') \
  > "$ROOT/DEBIAN/md5sums"

mkdir -p "$OUT"
DEB="$OUT/ola-plus_${VERSION}_${ARCH}.deb"
dpkg-deb --root-owner-group -Zxz -b "$ROOT" "$DEB"
echo "built $DEB"
dpkg-deb -I "$DEB" | sed -n '1,20p'

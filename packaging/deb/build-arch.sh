#!/usr/bin/env bash
# Build the ola-plus .deb for one architecture, from this repository, inside a Debian trixie
# container (as root). The same script is what CI runs, so a package can be reproduced with
#
#   docker run --rm -v "$PWD:/work" -w /work debian:trixie \
#     bash packaging/deb/build-arch.sh <amd64|arm64|armhf> <ui-dist-dir> <out-dir>
#
# When the target is the machine's own architecture the build is native; otherwise it is
# cross-compiled (a host-side ola_protoc_plugin is built first and reused, which is OLA's own
# cross-compile mechanism). The package version comes from the commit, not from the clock, so
# every architecture built from one commit gets the same version, and it grows with new commits.
set -euo pipefail

ARCH=${1:?usage: build-arch.sh <amd64|arm64|armhf> <ui-dist-dir> <out-dir>}
UI=${2:?ui dist dir}
OUT=${3:?output dir}
REPO=$(cd "$(dirname "$0")/../.." && pwd)
cd "$REPO"
export DEBIAN_FRONTEND=noninteractive

BUILD_ARCH=$(dpkg --print-architecture)
CROSS=0
[ "$ARCH" = "$BUILD_ARCH" ] || CROSS=1

apt-get update
apt-get install -y --no-install-recommends \
  build-essential autoconf automake libtool pkgconf bison flex file git ca-certificates \
  protobuf-compiler libprotobuf-dev libprotoc-dev uuid-dev libmicrohttpd-dev libcppunit-dev

# Libraries olad links against, for the target architecture.
TARGET_LIBS="libprotobuf-dev uuid-dev libmicrohttpd-dev libcppunit-dev libncurses-dev zlib1g-dev
             libusb-1.0-0-dev libftdi1-dev liblo-dev libavahi-client-dev"
if [ "$CROSS" = 1 ]; then
  dpkg --add-architecture "$ARCH"
  apt-get update
  # shellcheck disable=SC2046
  apt-get install -y --no-install-recommends "crossbuild-essential-$ARCH" \
    $(for p in $TARGET_LIBS; do printf '%s:%s ' "$p" "$ARCH"; done)
else
  # shellcheck disable=SC2086
  apt-get install -y --no-install-recommends $TARGET_LIBS
fi

MULTIARCH=$(dpkg-architecture -a"$ARCH" -qDEB_HOST_MULTIARCH)
TRIPLET=$(dpkg-architecture -a"$ARCH" -qDEB_HOST_GNU_TYPE)

git config --global --add safe.directory "$REPO"
STAMP=$(TZ=UTC git log -1 --format=%cd --date=format-local:%Y%m%d%H%M%S)
VERSION="0.10.9+plus${STAMP}+g$(git rev-parse --short HEAD)"
echo "building ola-plus $VERSION for $ARCH ($([ "$CROSS" = 1 ] && echo "cross, from $BUILD_ARCH" || echo native))"

autoreconf -i

# Debian layout, so the package replaces the Debian ola package cleanly.
LAYOUT="--prefix=/usr --sysconfdir=/etc --localstatedir=/var --libdir=/usr/lib/$MULTIARCH"
FLAGS="CPPFLAGS=-Wno-deprecated-declarations"

rm -rf build stage
mkdir build
if [ "$CROSS" = 1 ]; then
  mkdir build-host
  (cd build-host && ../configure "$FLAGS" && make -j"$(nproc)" protoc/ola_protoc_plugin)
  export PKG_CONFIG_LIBDIR="/usr/lib/$MULTIARCH/pkgconfig:/usr/share/pkgconfig"
  (cd build && ../configure --host="$TRIPLET" $LAYOUT \
     --with-ola-protoc-plugin="$REPO/build-host/protoc/ola_protoc_plugin" "$FLAGS")
  STRIP="$TRIPLET-strip"
else
  (cd build && ../configure $LAYOUT "$FLAGS")
  STRIP=strip
fi

(cd build && make -j"$(nproc)" && make install DESTDIR="$REPO/stage")

bash packaging/deb/build-deb.sh stage "$UI" "$VERSION" "$ARCH" "$OUT" "$STRIP"

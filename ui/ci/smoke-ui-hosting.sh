#!/usr/bin/env bash
# Checks that a running olad (started with --ui-dir pointing at ui/dist) hosts the web UI
# correctly at /ui/, and that the static file handler can't be tricked out of its directory.
# Usage: smoke-ui-hosting.sh [base-url]   (default http://127.0.0.1:9090)
set -u
BASE="${1:-http://127.0.0.1:9090}"
fail=0

check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected '$2', got '$3'"; fail=1; fi
}
status() { curl -s -o /dev/null -w '%{http_code}' --path-as-is "$@"; }
# olad only answers GET and POST (any other method just closes the connection), so read
# response headers from a GET instead of HEAD.
header() { # lower-case-name url
  curl -s -D - -o /dev/null "$2" | tr -d '\r' | awk -F': ' -v h="$1" 'tolower($1)==h{print $2}'
}
contains() { # name needle haystack
  case "$3" in *"$2"*) echo "ok   $1" ;; *) echo "FAIL $1: '$2' not found"; fail=1 ;; esac
}

root=$(curl -s "$BASE/ui/")
check "GET /ui/ is 200" 200 "$(status "$BASE/ui/")"
contains "index.html is the OLA Plus app" '<div id="app">' "$root"
check "index.html is not cached" "no-cache" "$(header cache-control "$BASE/ui/")"

check "GET /ui redirects to /ui/" 302 "$(status "$BASE/ui")"
check "redirect target" "/ui/" "$(header location "$BASE/ui")"

# The hashed bundle named by index.html must be served as JavaScript.
asset=$(printf '%s' "$root" | grep -o 'assets/[^"]*\.js' | head -1)
check "index.html references a bundle" "yes" "$([ -n "$asset" ] && echo yes || echo no)"
check "GET bundle is 200" 200 "$(status "$BASE/ui/$asset")"
check "bundle content type" "text/javascript; charset=utf-8" "$(header content-type "$BASE/ui/$asset")"

# PWA files: installable manifest, icons and the service worker script, with the right types.
check "manifest type" "application/manifest+json" "$(header content-type "$BASE/ui/manifest.webmanifest")"
check "manifest is JSON naming the app" "yes" "$(curl -s "$BASE/ui/manifest.webmanifest" | grep -q '"OLA Plus"' && echo yes || echo no)"
check "icon type" "image/png" "$(header content-type "$BASE/ui/icons/icon-192.png")"
check "icon 512 is served" 200 "$(status "$BASE/ui/icons/icon-512.png")"
check "favicon type" "image/svg+xml" "$(header content-type "$BASE/ui/favicon.svg")"
check "service worker script type" "text/javascript; charset=utf-8" "$(header content-type "$BASE/ui/sw.js")"

# Single page app routes fall back to index.html; missing files must 404.
check "client route falls back to index.html" 200 "$(status "$BASE/ui/patch")"
contains "fallback body is the app" '<div id="app">' "$(curl -s "$BASE/ui/patch")"
check "missing asset is 404" 404 "$(status "$BASE/ui/assets/nope.js")"
check "directory request doesn't crash" 200 "$(status "$BASE/ui/assets")"

# Path traversal, in the shapes clients and attackers actually send.
check "../ traversal" 404 "$(status "$BASE/ui/../../../../etc/passwd")"
check "encoded ../ traversal" 404 "$(status "$BASE/ui/%2e%2e/%2e%2e/%2e%2e/etc/passwd")"
check "backslash traversal" 404 "$(status "$BASE/ui/..%5c..%5cetc/passwd")"
check "double slash" 404 "$(status "$BASE/ui//etc/passwd")"
# A POST needs a form body or olad drops the connection before routing it.
check "POST is not served" 404 "$(status -X POST -d x=1 "$BASE/ui/")"

# The API must be untouched and olad still alive after all of the above.
check "API still works" 200 "$(status "$BASE/json/server_stats")"
# With the new UI present it is the front door; the classic UI moves to /classic.
check "root redirects to the new UI" 302 "$(status "$BASE/")"
check "root redirect target" "/ui/" "$(header location "$BASE/")"
check "classic UI still reachable" 200 "$(status "$BASE/classic")"

exit $fail

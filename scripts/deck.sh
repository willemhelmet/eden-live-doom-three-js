#!/usr/bin/env bash
# SteamOS launcher: installs only inside this checkout. No sudo or pacman.
set -euo pipefail
cd "$(dirname "$0")/.."
DEMO_ROOT="$PWD"
DEMO_RUNTIME="$DEMO_ROOT/.runtime"
mkdir -p "$DEMO_RUNTIME"

if ! command -v node >/dev/null || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=14)?0:1)' 2>/dev/null; then
  if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
    echo 'Install Node.js 22.14+ on this machine, then run npm ci and npm run dev.' >&2
    exit 1
  fi
  if [[ ! -x "$DEMO_RUNTIME/node/bin/node" ]]; then
    echo 'Downloading a portable Node.js 24 LTS runtime from nodejs.org…'
    curl --fail --location --silent --show-error https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$DEMO_RUNTIME/SHASUMS256.txt"
    DEMO_ARCHIVE="$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2}' "$DEMO_RUNTIME/SHASUMS256.txt")"
    [[ "$DEMO_ARCHIVE" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$ ]] || { echo 'Could not resolve the Node download.' >&2; exit 1; }
    curl --fail --location --silent --show-error "https://nodejs.org/dist/latest-v24.x/$DEMO_ARCHIVE" -o "$DEMO_RUNTIME/$DEMO_ARCHIVE"
    (cd "$DEMO_RUNTIME"; awk -v f="$DEMO_ARCHIVE" '$2 == f {print}' SHASUMS256.txt | sha256sum --check -)
    mkdir -p "$DEMO_RUNTIME/node"
    tar -xJf "$DEMO_RUNTIME/$DEMO_ARCHIVE" --strip-components=1 -C "$DEMO_RUNTIME/node"
    rm "$DEMO_RUNTIME/$DEMO_ARCHIVE"
  fi
  export PATH="$DEMO_RUNTIME/node/bin:$PATH"
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo "Created $DEMO_ROOT/.env. Add REACTOR_API_KEY there for EdenLive; original Doom needs no key."
fi

if command -v sha256sum >/dev/null; then
  DEMO_LOCK="$(sha256sum package-lock.json | cut -d ' ' -f 1)"
else
  DEMO_LOCK="$(shasum -a 256 package-lock.json | cut -d ' ' -f 1)"
fi
if [[ ! -d node_modules || ! -f "$DEMO_RUNTIME/installed-lock" || "$(cat "$DEMO_RUNTIME/installed-lock")" != "$DEMO_LOCK" ]]; then
  npm ci
  echo "$DEMO_LOCK" > "$DEMO_RUNTIME/installed-lock"
fi
npm run build

DEMO_PORT="$(node --input-type=module -e 'process.loadEnvFile(".env");console.log(process.env.PORT || "3210")')"
[[ "$DEMO_PORT" =~ ^[0-9]+$ ]] || { echo 'Invalid PORT in .env.' >&2; exit 1; }
DEMO_URL="http://127.0.0.1:$DEMO_PORT/?theater=1"
if curl --fail --silent --connect-timeout 1 "http://127.0.0.1:$DEMO_PORT/api/config" >/dev/null; then
  echo "A demo is already listening on port $DEMO_PORT. Close it or choose another PORT in .env." >&2
  exit 1
fi
node server.mjs > "$DEMO_RUNTIME/server.log" 2>&1 &
DEMO_SERVER_PID=$!
trap 'kill "$DEMO_SERVER_PID" 2>/dev/null || true' EXIT
trap 'exit 130' INT TERM
DEMO_READY=false
for ((i=0; i<100; i++)); do
  if ! kill -0 "$DEMO_SERVER_PID" 2>/dev/null; then cat "$DEMO_RUNTIME/server.log" >&2; exit 1; fi
  if curl --fail --silent "http://127.0.0.1:$DEMO_PORT/api/config" >/dev/null; then DEMO_READY=true; break; fi
  sleep 0.1
done
[[ "$DEMO_READY" == true ]] || { echo 'Server did not become ready. See .runtime/server.log.' >&2; exit 1; }
echo "Doom ready: $DEMO_URL"
echo 'X: start/stop Eden | Y: original/Eden | View: split view | R3: fullscreen'
if [[ "${1:-}" == --no-browser ]]; then wait "$DEMO_SERVER_PID"; exit; fi

if command -v chromium >/dev/null; then
  chromium --user-data-dir="$DEMO_RUNTIME/chromium" --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required --kiosk --app="$DEMO_URL"
elif command -v chromium-browser >/dev/null; then
  chromium-browser --user-data-dir="$DEMO_RUNTIME/chromium" --no-first-run --autoplay-policy=no-user-gesture-required --kiosk --app="$DEMO_URL"
elif command -v google-chrome >/dev/null; then
  google-chrome --user-data-dir="$DEMO_RUNTIME/chromium" --no-first-run --autoplay-policy=no-user-gesture-required --kiosk --app="$DEMO_URL"
elif command -v flatpak >/dev/null && flatpak info org.chromium.Chromium >/dev/null 2>&1; then
  flatpak run --filesystem="$DEMO_ROOT" --filesystem=/run/udev:ro --device=all org.chromium.Chromium --user-data-dir="$DEMO_RUNTIME/chromium" --no-first-run --autoplay-policy=no-user-gesture-required --kiosk --app="$DEMO_URL"
elif command -v flatpak >/dev/null && flatpak info com.google.Chrome >/dev/null 2>&1; then
  flatpak run --filesystem="$DEMO_ROOT" --filesystem=/run/udev:ro --device=all com.google.Chrome --user-data-dir="$DEMO_RUNTIME/chromium" --no-first-run --autoplay-policy=no-user-gesture-required --kiosk --app="$DEMO_URL"
else
  echo "Install Chromium from Discover, or open $DEMO_URL in Chromium yourself."
  echo 'Keep this terminal open. Ctrl-C stops the server.'
  wait "$DEMO_SERVER_PID"
fi

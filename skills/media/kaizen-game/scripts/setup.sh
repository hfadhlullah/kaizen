#!/bin/sh
# Installs Playwright + Chromium into ~/.kaizen/kaizen-game (override KAIZEN_GAME_HOME). About 150 MB.
set -e
H="${KAIZEN_GAME_HOME:-$HOME/.kaizen/kaizen-game}"
mkdir -p "$H"
[ -f "$H/package.json" ] || echo '{"private":true}' > "$H/package.json"
npm install --prefix "$H" --no-audit --no-fund playwright@1.62.1
cd "$H" && npx playwright install chromium
echo "ok: $H"

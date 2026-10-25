#!/bin/sh
# Installs Playwright + Chromium for pdf.mjs / verify.mjs into ~/.kaizen/kaizen-book (override KAIZEN_BOOK_HOME).
set -e
H="${KAIZEN_BOOK_HOME:-$HOME/.kaizen/kaizen-book}"
mkdir -p "$H"
[ -f "$H/package.json" ] || echo '{"private":true}' > "$H/package.json"
npm install --prefix "$H" --no-audit --no-fund playwright@1.62.1
cd "$H" && npx playwright install chromium
echo "ok: $H"

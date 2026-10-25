#!/usr/bin/env bash
# Quick check frames of a built film: scripts/still.sh <film-dir> <second> [<second>...]
# -> <film-dir>/film/check/at-<second>s.png (run make_film.py first; delete the folder after looking)
set -euo pipefail
DIR=$(cd "$1" && pwd); shift
IFS=,; (cd "$DIR/film" && npx --yes hyperframes@0.8.176 snapshot --at "$*" --no-end -o check >/dev/null)
ls "$DIR"/film/check/*.png

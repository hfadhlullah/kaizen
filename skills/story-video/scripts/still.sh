#!/usr/bin/env bash
# Quick check frames: scripts/still.sh <film-dir> <16x9|9x16> <frame> [<frame>...]  -> <film-dir>/out/check-<frame>.jpg
set -euo pipefail
DIR=$(cd "$1" && pwd); FMT=$2; shift 2
ENGINE=${STORY_VIDEO_ENGINE:-$HOME/.kaizen/story-video/engine}
python3 -c "import json; json.dump({'film': json.load(open('$DIR/film.json')), 'words': json.load(open('$DIR/words.json'))}, open('$DIR/.props.json','w'))"
for fr in "$@"; do
  (cd "$ENGINE" && npx remotion still src/index.ts "Film-$FMT" "$DIR/out/check-$fr.jpg" --frame="$fr" --props="$DIR/.props.json" --public-dir="$DIR" --image-format=jpeg --scale=0.33 --log=error 2>&1 | grep -iv network | tail -1 || true)
done
rm "$DIR/.props.json"; ls "$DIR"/out/check-*.jpg

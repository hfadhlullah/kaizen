#!/usr/bin/env bash
# Render one format of a film, master loudness (two-pass), write .srt + thumbnail + credits.
# Earlier deliveries move to out/previous/ (never overwritten).
# Usage: scripts/master.sh <film-dir> <16x9|9x16> <out-name> [lufs: -14 social | -16 presentation] [thumb-second]
set -euo pipefail
DIR=$(cd "${1:?film dir}" && pwd); FMT=${2:?format}; NAME=${3:?name}; LUFS=${4:--16}; THUMB=${5:-3}
SKILL=$(cd "$(dirname "$0")/.." && pwd)
ENGINE=${STORY_VIDEO_ENGINE:-$HOME/.kaizen/story-video/engine}
OUT="$DIR/out"; mkdir -p "$OUT/previous"
if [ -f "$OUT/$NAME.mp4" ]; then
  stamp=$(date +%Y%m%d-%H%M%S)
  for x in "$OUT/$NAME".mp4 "$OUT/$NAME".srt "$OUT/$NAME"-thumb.jpg; do [ -f "$x" ] && mv "$x" "$OUT/previous/$(basename "${x%.*}")-$stamp.${x##*.}"; done
fi
python3 -c "import json,sys; json.dump({'film': json.load(open('$DIR/film.json')), 'words': json.load(open('$DIR/words.json'))}, open('$DIR/.props.json','w'))"
(cd "$ENGINE" && npx remotion render src/index.ts "Film-$FMT" "$OUT/$NAME.raw.mp4" --props="$DIR/.props.json" --public-dir="$DIR" --log=error 2>&1 | grep -v "network requests" || true)
J=$(ffmpeg -hide_banner -i "$OUT/$NAME.raw.mp4" -af loudnorm=I=$LUFS:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')
g(){ echo "$J" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i "$OUT/$NAME.raw.mp4" -c:v copy -c:a aac -b:a 192k \
  -af "loudnorm=I=$LUFS:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true" \
  "$OUT/$NAME.mp4"
rm "$OUT/$NAME.raw.mp4" "$DIR/.props.json"
python3 "$SKILL/scripts/srt.py" "$DIR" "$OUT/$NAME.srt"
ffmpeg -v error -y -ss "$THUMB" -i "$OUT/$NAME.mp4" -frames:v 1 -q:v 2 "$OUT/$NAME-thumb.jpg"
cat "$DIR"/CREDITS-*.txt > "$OUT/$NAME-credits.txt" 2>/dev/null || true
echo "Voice & sound effects: see the voice provider in film.json (ElevenLabs commercial use requires a paid plan)." >> "$OUT/$NAME-credits.txt"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$NAME.mp4" | xargs -I{} echo "done: $OUT/$NAME.mp4 ({} s, $LUFS LUFS)"

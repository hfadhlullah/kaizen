#!/usr/bin/env bash
# Render a built film (make_film.py), master loudness (two-pass), write .srt + thumbnail + credits.
# Run from the project folder. Earlier deliveries move to output/<name>/<preset>/previous/ (never overwritten).
# Usage: scripts/master.sh <film-dir> [lufs: default from the style, -14 social | -16 presentation] [thumb-second]
# Writes output/<film>/<preset>/<name>.mp4; <name> is <film>-<shape> when make_film.py ran with --format.
set -euo pipefail
DIR=$(cd "${1:?film dir}" && pwd); THUMB=${3:-3}
SKILL=$(cd "$(dirname "$0")/.." && pwd)
m(){ python3 -c "import json;print(json.load(open('$DIR/film/meta.json')).get('$1',''))"; }
# folder: the film's name; name: the file's, which make_film.py --format suffixes (gerbang-4x5) so shapes sit side by side.
NAME=$(m name); FOLDER=$(m folder); PRESET=$(m preset); LUFS=${2:-$(m loudness)}
OUT="$PWD/output/${FOLDER:-$NAME}/$PRESET"; mkdir -p "$OUT/previous"
if [ -f "$OUT/$NAME.mp4" ]; then
  stamp=$(date +%Y%m%d-%H%M%S)
  for x in "$OUT/$NAME".mp4 "$OUT/$NAME".srt "$OUT/$NAME"-thumb.jpg; do [ -f "$x" ] && mv "$x" "$OUT/previous/$(basename "${x%.*}")-$stamp.${x##*.}"; done
fi
(cd "$DIR/film" && npx --yes hyperframes@0.8.176 render --crf 20 -o "$OUT/$NAME.raw.mp4" >/dev/null)
J=$(ffmpeg -hide_banner -i "$OUT/$NAME.raw.mp4" -af loudnorm=I=$LUFS:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')
g(){ echo "$J" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i "$OUT/$NAME.raw.mp4" -c:v copy -c:a aac -b:a 192k \
  -af "loudnorm=I=$LUFS:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true" \
  "$OUT/$NAME.mp4"
rm "$OUT/$NAME.raw.mp4"; rm -rf "$DIR/film/renders"
python3 "$SKILL/scripts/srt.py" "$DIR" "$OUT/$NAME.srt"
ffmpeg -v error -y -ss "$THUMB" -i "$OUT/$NAME.mp4" -frames:v 1 -q:v 2 "$OUT/$NAME-thumb.jpg"
cp "$DIR/film/CREDITS.txt" "$OUT/CREDITS.txt"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$NAME.mp4" | xargs -I{} echo "done: $OUT/$NAME.mp4 ({} s, $LUFS LUFS)"

#!/usr/bin/env bash
# Fetch a Kevin MacLeod track (incompetech.com, CC BY 4.0 — credit required) into <film-dir>/music.mp3,
# loudness-normalised and cut to 3 minutes. Usage: scripts/music.sh <film-dir> "Track Name"
set -euo pipefail
f=$1; name=$2
url="https://incompetech.com/music/royalty-free/mp3-royaltyfree/$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$name").mp3"
curl -sfL -o /tmp/sv-music.mp3 "$url"
ffmpeg -v error -y -t 180 -i /tmp/sv-music.mp3 -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 44100 "$f/music.mp3"
echo "Music: $name — Kevin MacLeod (incompetech.com), CC BY 4.0" > "$f/CREDITS-music.txt"
rm -f /tmp/sv-music.mp3; echo "music ok: $name"

#!/usr/bin/env bash
# Prepare a video workspace inside the project's .kaizen and the shared engine (installed once).
# Usage: scripts/setup.sh <slug>
#   -> ~/.kaizen/videos/<slug>/{inputs,out,intake}  (all film data and deliverables; override STORY_VIDEO_HOME)
#   -> ~/.kaizen/story-video/engine                 (Remotion engine + node_modules, shared by all projects)
set -euo pipefail
"$(dirname "$0")/check.sh" >/dev/null || { "$(dirname "$0")/check.sh"; exit 1; }
SLUG=${1:?usage: setup.sh <slug>}
SKILL=$(cd "$(dirname "$0")/.." && pwd)
ENGINE=${STORY_VIDEO_ENGINE:-$HOME/.kaizen/story-video/engine}
if [ ! -d "$ENGINE/node_modules/remotion" ]; then
  mkdir -p "$ENGINE"
  cp -r "$SKILL/engine/." "$ENGINE/"
  (cd "$ENGINE" && npm install --silent --no-audit --no-fund)
fi
# keep engine code current with the skill (node_modules untouched)
cp -r "$SKILL/engine/src" "$SKILL/engine/package.json" "$SKILL/engine/tsconfig.json" "$ENGINE/"
# sound library: made on this machine (never shipped) — ElevenLabs with a key, otherwise synthesized
[ "$(ls "$ENGINE/sfx" 2>/dev/null | wc -l)" -ge 14 ] || STORY_VIDEO_ENGINE="$ENGINE" python3 "$SKILL/scripts/sfx.py" ${SFX_PROVIDER:+--provider "$SFX_PROVIDER"}
DIR="${STORY_VIDEO_HOME:-$HOME/.kaizen/videos}/$SLUG"
mkdir -p "$DIR/inputs" "$DIR/out/previous" "$DIR/intake"
[ -e "$DIR/sfx" ] || ln -s "$ENGINE/sfx" "$DIR/sfx"
[ -f "$DIR/REVISIONS.md" ] || printf '# Revisions — %s\n\n' "$SLUG" > "$DIR/REVISIONS.md"
echo "engine: $ENGINE"
echo "film:   $DIR  (put the user's material in $DIR/inputs)"

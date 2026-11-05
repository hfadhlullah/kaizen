#!/bin/sh
# Lists what kaizen-game needs and whether it is here. Exit 1 if anything required is missing.
miss=0
command -v node >/dev/null 2>&1 && echo "ok      node $(node -v)" || { echo "MISSING node"; miss=1; }
found=""
for h in "$KAIZEN_GAME_HOME" "$HOME/.kaizen/kaizen-game" "$HOME/.kaizen/kaizen-book"; do
  [ -n "$h" ] && [ -d "$h/node_modules/playwright" ] && { found="$h"; break; }
done
[ -n "$found" ] && echo "ok      playwright ($found)" || { echo "MISSING playwright: run scripts/setup.sh"; miss=1; }
command -v pandoc >/dev/null 2>&1 && echo "ok      pandoc (GDD PDF)" || echo "-       pandoc not found (optional, only for gdd-pdf.mjs)"
command -v ffmpeg >/dev/null 2>&1 && echo "ok      ffmpeg (sound conversion)" || echo "-       ffmpeg not found (optional, .ogg to .m4a)"
command -v pdftotext >/dev/null 2>&1 && echo "ok      pdftotext (reading source rules)" || echo "-       pdftotext not found (optional, poppler)"
exit $miss

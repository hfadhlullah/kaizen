#!/bin/sh
# Lists what kaizen-book needs and whether it is here. Exit 1 if anything is missing.
H="${KAIZEN_BOOK_HOME:-$HOME/.kaizen/kaizen-book}"; miss=0
for c in python3 node npm pdfinfo; do
  if command -v $c >/dev/null 2>&1; then echo "ok      $c"; else echo "MISSING $c"; miss=1; fi
done
command -v pdfinfo >/dev/null 2>&1 || echo "        pdfinfo comes with poppler (poppler-utils): contents page numbers need it"
if [ -d "$H/node_modules/playwright" ]; then echo "ok      playwright ($H)"; else echo "MISSING playwright: run scripts/setup.sh"; miss=1; fi
command -v pandoc >/dev/null 2>&1 && echo "ok      pandoc (optional, .docx import)" || echo "-       pandoc not found (optional, only for .docx manuscripts)"
exit $miss

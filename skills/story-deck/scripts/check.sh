#!/usr/bin/env bash
# Requirements for story-deck. Exit 1 if anything required is missing.
miss=0
need(){ command -v "$1" >/dev/null 2>&1 && echo "ok   $1" || { echo "MISSING $1 — $2"; miss=1; }; }
need node     "Node.js 18+ (https://nodejs.org or your package manager)"
need npm      "comes with Node.js"
need python3  "Python 3.9+"
need soffice  "LibreOffice (renders slides for the visual check)"
need pdftoppm "poppler-utils (brew install poppler / apt install poppler-utils / pacman -S poppler)"
[ -d "$HOME/.kaizen/decks/node_modules/pptxgenjs" ] && echo "ok   pptxgenjs" || echo "todo pptxgenjs — cd ~/.kaizen/decks && npm init -y && npm i pptxgenjs"
fc-list 2>/dev/null | grep -qi "Playfair Display" && echo "ok   fonts" || echo "todo fonts — ~/.kaizen/decks/.venv/bin/python scripts/install_fonts.py"
exit $miss

#!/usr/bin/env bash
# Requirements for story-video. Prints what is missing and how to install it; exit 1 if anything required is missing.
miss=0
need(){ command -v "$1" >/dev/null 2>&1 && echo "ok   $1" || { echo "MISSING $1 — $2"; miss=1; }; }
opt(){ command -v "$1" >/dev/null 2>&1 && echo "ok   $1" || echo "opt  $1 — $2"; }
need node    "Node.js 18+ (https://nodejs.org or your package manager)"
need npm     "comes with Node.js"
need python3 "Python 3.9+"
need ffmpeg  "ffmpeg (brew install ffmpeg / apt install ffmpeg / pacman -S ffmpeg / winget install ffmpeg)"
need ffprobe "comes with ffmpeg"
opt  soffice   "LibreOffice — only for importing .pptx decks"
opt  pdftoppm  "poppler-utils — only for importing decks"
opt  markitdown "pip install 'markitdown[pptx]' — only for reading .pptx text"
python3 -c "import PIL" 2>/dev/null && echo "ok   Pillow" || { echo "MISSING Pillow — pip install pillow"; miss=1; }
python3 -c "import edge_tts" 2>/dev/null && echo "ok   edge-tts (free voices)" || echo "opt  edge-tts — pip install edge-tts (free voice when there is no ElevenLabs key)"
python3 -c "import qrcode" 2>/dev/null && echo "ok   qrcode" || echo "opt  qrcode — pip install 'qrcode[pil]' (QR on the CTA)"
[ -n "${ELEVENLABS_API_KEY:-}" ] && echo "ok   ELEVENLABS_API_KEY set" || echo "info no ELEVENLABS_API_KEY — free voice (edge-tts) and synthesized sound effects will be used"
echo "note first setup downloads the Remotion engine (~750 MB) into ~/.kaizen/story-video/engine"
exit $miss

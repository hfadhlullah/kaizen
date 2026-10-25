#!/usr/bin/env bash
# Requirements for kaizen-video. Prints what is missing and how to install it; exit 1 if anything required is missing.
miss=0
HOME_DIR=${KAIZEN_VIDEO_HOME:-$HOME/.kaizen/kaizen-video}
need(){ command -v "$1" >/dev/null 2>&1 && echo "ok   $1" || { echo "MISSING $1 — $2"; miss=1; }; }
need ffmpeg  "ffmpeg (brew install ffmpeg / apt install ffmpeg / pacman -S ffmpeg / winget install ffmpeg)"
need ffprobe "comes with ffmpeg"
need node    "Node.js 18+ (https://nodejs.org or your package manager)"
need npm     "comes with Node.js"
need npx     "comes with Node.js"
need python3 "Python 3.9+"
command -v uv >/dev/null 2>&1 && echo "ok   uv" || { echo "MISSING uv — https://docs.astral.sh/uv/ (installs Python 3.11 for WhisperX)"; miss=1; }
[ -x "$HOME_DIR/whisperx-venv/bin/python" ] && echo "ok   WhisperX ($HOME_DIR/whisperx-venv)" || echo "todo WhisperX — run setup.sh (about 2 GB of packages, plus a 3 GB model on the first transcription)"
# From-scratch films (make_film.py) need these too; WhisperX is footage-only.
opt(){ command -v "$1" >/dev/null 2>&1 && echo "ok   $1" || echo "opt  $1 — $2"; }
opt soffice  "LibreOffice — only for importing .pptx decks"
opt pdftoppm "poppler-utils — only for importing decks"
python3 -c "import PIL" 2>/dev/null && echo "ok   Pillow" || echo "opt  Pillow — pip install pillow (from-scratch: intake.py)"
python3 -c "import edge_tts" 2>/dev/null && echo "ok   edge-tts (free voices)" || echo "opt  edge-tts — pip install edge-tts (from-scratch voice without an ElevenLabs key)"
python3 -c "import qrcode" 2>/dev/null && echo "ok   qrcode" || echo "opt  qrcode — pip install 'qrcode[pil]' (QR on the CTA)"
[ -n "${ELEVENLABS_API_KEY:-}" ] && echo "ok   ELEVENLABS_API_KEY set" || echo "info no ELEVENLABS_API_KEY — from-scratch uses edge-tts and synthesized sound effects"
exit $miss

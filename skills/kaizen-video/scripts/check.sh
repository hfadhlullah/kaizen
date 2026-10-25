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
exit $miss

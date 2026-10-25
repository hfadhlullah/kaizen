#!/usr/bin/env bash
# Install WhisperX once per machine, shared by every project.
# Usage: scripts/setup.sh   -> ~/.kaizen/kaizen-video/{whisperx-venv,huggingface}  (override KAIZEN_VIDEO_HOME)
set -euo pipefail
"$(dirname "$0")/check.sh" >/dev/null || { "$(dirname "$0")/check.sh"; exit 1; }
HOME_DIR=${KAIZEN_VIDEO_HOME:-$HOME/.kaizen/kaizen-video}
VENV="$HOME_DIR/whisperx-venv"
if ! "$VENV/bin/python" -c "import whisperx" 2>/dev/null; then
  mkdir -p "$HOME_DIR"
  uv venv -q -p 3.11 "$VENV"
  uv pip install -q -p "$VENV/bin/python" "whisperx==3.8.6"
fi
mkdir -p "$HOME_DIR/huggingface"
echo "whisperx: HF_HOME=$HOME_DIR/huggingface $VENV/bin/python <skill>/scripts/transcribe.py videos/<name>"

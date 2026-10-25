"""Transcribe the footage in videos/<name>/raw/ with WhisperX: <whisperx python> transcribe.py videos/<name>

Uses CUDA (float16) when torch sees a GPU, otherwise CPU (int8); KAIZEN_VIDEO_DEVICE=cpu|cuda overrides.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import torch
import whisperx

VIDEO = (".mp4", ".mov", ".m4v", ".mkv", ".webm")


root = Path(sys.argv[1]).resolve()
audio_path = root / "transcript/audio.wav"
output_path = root / "transcript/words.json"

if output_path.exists():
    print(f"Using existing {output_path}")
    raise SystemExit(0)

if not audio_path.exists():
    audio_path.parent.mkdir(exist_ok=True)
    raw = next(f for f in sorted((root / "raw").iterdir()) if f.suffix.lower() in VIDEO)
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(raw), "-vn", "-ac", "1", "-ar", "16000", str(audio_path)], check=True)

audio = whisperx.load_audio(str(audio_path))
device = os.environ.get("KAIZEN_VIDEO_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
print(f"device {device}, compute {'float16' if device == 'cuda' else 'int8'}")
model = whisperx.load_model("large-v3", device, compute_type="float16" if device == "cuda" else "int8")
result = model.transcribe(audio, batch_size=8)
del model

print(f"language {result['language']}")
align_model, metadata = whisperx.load_align_model(language_code=result["language"], device=device)
result = whisperx.align(result["segments"], align_model, metadata, audio, device)
assert result["word_segments"], "Alignment returned no words"

temporary_path = output_path.with_suffix(".json.tmp")
temporary_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
temporary_path.replace(output_path)
print(f"Saved {len(result['word_segments'])} words to {output_path}")

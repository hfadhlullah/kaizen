#!/usr/bin/env python3
"""Render the approved word-timed cut and a Resolve Free import copy."""

import bisect
import json
import subprocess
import sys
from fractions import Fraction
from pathlib import Path


ROOT = Path(sys.argv[1]).resolve()  # videos/<name>
RAW = ROOT / "work/censored.mp4"  # censored copy of raw/, when a video needs one
RAW = RAW if RAW.exists() else next(f for f in sorted((ROOT / "raw").iterdir())
                                     if f.suffix.lower() in (".mp4", ".mov", ".m4v", ".mkv", ".webm"))
CUTS = ROOT / "transcript/cuts.json"
MP4 = ROOT / "work/cut.mp4"
RESOLVE = ROOT / "work/cut-resolve.mov"


def probe(*args):
    return json.loads(subprocess.check_output(["ffprobe", "-v", "error", *args, str(RAW)]))


def count_frames(path):
    data = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
        "-show_entries", "stream=nb_read_frames:format=duration", "-of", "json", str(path)
    ]))
    return int(data["streams"][0]["nb_read_frames"]), float(data["format"]["duration"])


def main():
    stream = probe("-select_streams", "v:0", "-show_entries", "stream=r_frame_rate,width,height", "-of", "json")["streams"][0]
    fps = Fraction(stream["r_frame_rate"])
    frames = probe("-select_streams", "v:0", "-show_frames", "-show_entries", "frame=best_effort_timestamp_time", "-of", "json")["frames"]
    pts = [float(frame["best_effort_timestamp_time"]) for frame in frames]
    segments = json.loads(CUTS.read_text())["segments"]
    assert pts == sorted(pts) and len(segments) > 0

    def nearest(time):
        i = bisect.bisect_left(pts, time)
        return min((j for j in (i - 1, i) if 0 <= j < len(pts)), key=lambda j: abs(pts[j] - time))

    plan = []
    for segment in segments:
        start, end = nearest(segment["start"]), nearest(segment["end"])
        assert 0 <= start < end < len(pts)
        if plan:
            assert start >= plan[-1]["end_frame"]
        plan.append({"start_frame": start, "end_frame": end, "start_time": pts[start],
                     "end_time": pts[end], "frames": end - start, "text": segment["text"]})
    (ROOT / "transcript/render-plan.json").write_text(json.dumps({
        "fps": str(fps), "width": stream["width"], "height": stream["height"],
        "segments": plan
    }, indent=2) + "\n")

    MP4.parent.mkdir(exist_ok=True)
    n = len(plan)
    filters = [f"[0:v]split={n}" + "".join(f"[v{i}]" for i in range(n)),
               f"[0:a]asplit={n}" + "".join(f"[a{i}]" for i in range(n))]
    for i, part in enumerate(plan):
        filters += [f"[v{i}]trim=start_frame={part['start_frame']}:end_frame={part['end_frame']},setpts=PTS-STARTPTS[v{i}o]",
                    f"[a{i}]atrim=start={part['start_time']:.6f}:end={part['end_time']:.6f},asetpts=PTS-STARTPTS[a{i}o]"]
    filters.append("".join(f"[v{i}o][a{i}o]" for i in range(n)) + f"concat=n={n}:v=1:a=1[vout][aout]")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-stats", "-i", str(RAW),
                    "-filter_complex", ";".join(filters), "-map", "[vout]", "-map", "[aout]",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-fps_mode", "passthrough",
                    "-movflags", "+faststart", "-y", str(MP4)], check=True)

    expected_frames = sum(part["frames"] for part in plan)
    expected_duration = sum(part["end_time"] - part["start_time"] for part in plan)
    actual_frames, actual_duration = count_frames(MP4)
    assert actual_frames == expected_frames, (actual_frames, expected_frames)
    assert abs(actual_duration - expected_duration) < 2 / float(fps), (actual_duration, expected_duration)

    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-stats", "-i", str(MP4),
                    "-c:v", "dnxhd", "-profile:v", "dnxhr_lb", "-pix_fmt", "yuv422p",
                    "-c:a", "pcm_s16le", "-fps_mode", "passthrough", "-y", str(RESOLVE)], check=True)
    resolve_frames, resolve_duration = count_frames(RESOLVE)
    assert resolve_frames == expected_frames, (resolve_frames, expected_frames)
    assert abs(resolve_duration - expected_duration) < 2 / float(fps), (resolve_duration, expected_duration)
    print(f"{n} cuts; {expected_frames} frames at nominal {fps} fps; MP4 {actual_duration:.3f}s; Resolve MOV {resolve_duration:.3f}s")


if __name__ == "__main__":
    main()

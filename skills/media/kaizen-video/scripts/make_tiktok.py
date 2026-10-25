"""Build (and optionally render) a TikTok video from a preset + a per-video config.

    python3 scripts/make_tiktok.py videos/<name> [--render]

Run from the project folder. Writes the HyperFrames project into videos/<name>/tiktok/
and, with --render, overwrites output/<name>/<preset>/<name>.mp4 so revisions of the
same preset never pile up while different presets stay separate.

The preset is found by folder name in ./presets/, then $KAIZEN_VIDEO_PRESETS
(default ~/.kaizen/video-presets/), then the skill's bundled presets/. A preset file
missing from its folder falls back to the skill's shared assets/, tools/ and
hyperframes.json.
"""
import html
import os
import json
import shutil
import subprocess
import re
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
WORK = Path.cwd()
HF = "hyperframes@0.8.176"
FPS = 30
SFX_TRACK = {"reveal": 4, "ending": 6, "shutter": 3, "stamp": 4, "ding": 4, "whoosh": 6}  # any other sound: track 5
CARD_DUR = {"title": 1.8, "case": 3.2, "photo": 2.8}

vdir = Path(sys.argv[1]).resolve()
proj = vdir / "tiktok"
proj.mkdir(exist_ok=True)
cfg = json.loads((vdir / "config.json").read_text())
dirs = [WORK / "presets", Path(os.environ.get("KAIZEN_VIDEO_PRESETS", Path.home() / ".kaizen/video-presets")), SKILL / "presets"]
preset = next((d / cfg["preset"] for d in dirs if (d / cfg["preset"] / "index.html").exists()), None)
if not preset:
    names = sorted({p.parent.name for d in dirs if d.exists() for p in d.glob("*/index.html")})
    sys.exit(f"preset {cfg['preset']!r} not found in {', '.join(map(str, dirs))}; available: {', '.join(names)}")
print(f"preset {preset}")
src_of = lambda p: next(f for f in (preset / p, SKILL / p) if f.exists())  # preset file, else the shared one
rel = lambda p: (vdir / p).resolve()


def run(*cmd, **kw):
    subprocess.run(cmd, check=True, cwd=proj, **kw)


# 1. Preset files and this video's images into the project.
for f in ["package.json", "hyperframes.json"]:
    shutil.copy(src_of(f), proj / f)
for d in ["fonts", "sfx"]:
    shutil.rmtree(proj / "assets" / d, ignore_errors=True)
    for base in (SKILL, preset):  # shared assets first, the preset's own on top
        if (base / "assets" / d).exists():
            shutil.copytree(base / "assets" / d, proj / "assets" / d, dirs_exist_ok=True)
if (vdir / "images").exists():
    shutil.copytree(vdir / "images", proj / "assets/img", dirs_exist_ok=True)

# 2. Captions: WhisperX words, remapped onto the cut when a render plan is given.
words = [w for s in json.loads(rel(cfg["words"]).read_text())["segments"] for w in s["words"] if "start" in w]
if cfg.get("plan"):
    # Segment length is its time span: phone footage is often VFR, so frames / nominal fps is wrong.
    segs = [(s["start_time"], s["end_time"], s["end_time"] - s["start_time"]) for s in json.loads(rel(cfg["plan"]).read_text())["segments"]]
else:
    segs = [(0.0, 1e9, None)]
chunks, seg_starts, offset = [], [], 0.0
for s0, s1, length in segs:
    seg_starts.append(round(offset, 3))
    end_cut = offset + length if length else words[-1]["end"]
    cur = []
    for w in words:
        # Skip words the cut slices to a few frames (they flash as glitches).
        if not (s0 - 0.05 <= w["start"] < s1) or (w["end"] > s1 and s1 - w["start"] < 0.12):
            continue
        word = w["word"].strip()
        core = word.rstrip(",.?!")
        word = cfg.get("fix", {}).get(core, core) + word[len(core):]  # caption spelling corrections
        cur.append({"w": word, "s": round(offset + w["start"] - s0, 3),
                    "e": round(min(offset + w["end"] - s0, end_cut), 3)})
        # ponytail: fixed 3-word chunks, break early on punctuation
        if len(cur) == 3 or cur[-1]["w"][-1] in ",.?!":
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    offset = end_cut
cut_duration = offset
flat = [w for c in chunks for w in c]


def at(key, after=0):
    try:
        return next(w["s"] for w in flat if w["s"] >= after and w["w"].lower().strip(",.?!").startswith(key))
    except StopIteration:
        sys.exit(f"config error: no word starting with {key!r} after {after}s")


# Cold open: replay one strong line before the intro (TikTok hook). Everything else shifts by its length.
co = cfg.get("cold_open")
if co:
    co_a = at(co["from"], co.get("after", 0)) - 0.08
    co_b = next(w["e"] for w in flat if w["s"] >= co_a and w["w"].lower().strip(",.?!").startswith(co["to"])) + 0.25
else:
    co_a = co_b = 0.0
L = round(co_b - co_a, 3)
beats = sorted(({**{k: v for k, v in b_.items() if k not in ("word", "after")}, "t": round(at(b_["word"], b_.get("after", 0)) + L, 3)}
                for b_ in cfg["beats"]), key=lambda x: x["t"])
shift = lambda w, d: {**w, "s": round(w["s"] + d, 3), "e": round(w["e"] + d, 3)}
cold = [[shift(w, -co_a) for w in c if co_a <= w["s"] and w["e"] <= co_b] for c in chunks] if co else []
chunks = [c for c in cold if c] + [[shift(w, L) for w in c] for c in chunks]
seg_starts = ([0.0] if co else []) + [round(x + L, 3) for x in seg_starts]
video_duration = round(cut_duration + L, 3)
duration = round(video_duration + cfg.get("tail", 0), 3)  # tail: ending card holds after the footage ends
for i, c in enumerate(chunks):  # hold each chunk until the next one starts
    c[-1].pop("hold", None)
    nxt = chunks[i + 1][0]["s"] if i + 1 < len(chunks) else video_duration
    c[-1]["hold"] = round(max(c[-1]["e"], min(nxt, c[-1]["e"] + 0.6)), 3)
cards = [(b["t"], b["t"] + b.get("dur", CARD_DUR.get(b["kind"], 0))) for b in beats if b["kind"] in CARD_DUR]
for (a0, a1), (b0, _) in zip(cards, cards[1:]):
    if b0 < a1:
        print(f"warning: cards overlap at {a0:.2f}s and {b0:.2f}s")
(proj / "captions.js").write_text(
    f"window.CAPTIONS = {json.dumps(chunks, ensure_ascii=False)};\n"
    f"window.SEG_STARTS = {json.dumps(seg_starts)};\n"
    f"window.BEATS = {json.dumps(beats, ensure_ascii=False)};\n")

# 3. Sound effects: shutter on every card, stamp/ding on their beats, reactions from the config.
sfx = [("shutter", 0.3, 0.7)]
for b in beats:
    if b["kind"] in ("title", "case", "photo"):
        sfx.append(("shutter", b["t"], 0.7))
    if b["kind"] == "end":  # reversed gong swells in, hit lands 1.2 s in on the last word slam
        sfx.append(("ending", max(0, b["t"] + 0.54 - 1.2), 0.9))
    if b.get("stamp"):
        sfx.append(("stamp", b["t"] + 1.12, 0.9))
    if b["kind"] == "item":
        sfx.append(("reveal", b["t"], 0.6))
for r in cfg.get("reactions", []):
    sfx.append((r["sfx"], max(0, at(r["word"], r.get("after", 0)) + L + r.get("offset", 0)), r.get("volume", 0.5)))


def sfx_dur(n):
    f = proj / "assets/sfx" / f"{n}.wav"
    if not f.exists():
        sys.exit(f"config error: sound {n!r} is not in preset {cfg['preset']!r}; available: "
                 + ", ".join(sorted(p.stem for p in (proj / "assets/sfx").glob("*.wav"))))
    # ffprobe, not the wave module: user-added effects are often float or extensible WAVs
    return round(float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                                "-of", "csv=p=0", str(f)])), 2)


tags = "\n".join(f'      <audio id="sfx-{i}" src="assets/sfx/{n}.wav" data-start="{t:.2f}" data-duration="{sfx_dur(n)}" '
                 f'data-track-index="{SFX_TRACK.get(n, 5)}" data-volume="{v}"></audio>'
                 for i, (n, t, v) in enumerate(sorted(sfx, key=lambda x: x[1])))

# 4. Source video: cold open + cut, lanczos upscale to 1080x1920 with light sharpening,
#    dialogue cleanup (denoise, de-ess). Cached until the inputs or settings change.
src, key = rel(cfg["video"]), proj / "source.key"
vf = "scale=1080:1920:flags=lanczos,unsharp=5:5:0.6:5:5:0,fps=30,format=yuv420p"
af = "afftdn=nf=-28,deesser=i=0.35,aformat=sample_rates=48000:channel_layouts=stereo"
k = json.dumps([str(src), src.stat().st_mtime, co_a, co_b, vf, af])
if not (proj / "source.mp4").exists() or not key.exists() or key.read_text() != k:
    if co:
        graph = (f"[0:v]split[v1][v2];[0:a]asplit[a1][a2];"
                 f"[v1]trim={co_a}:{co_b},setpts=PTS-STARTPTS[cv];[a1]atrim={co_a}:{co_b},asetpts=PTS-STARTPTS[ca];"
                 f"[cv][ca][v2][a2]concat=n=2:v=1:a=1[v0][a0];[v0]{vf}[v];[a0]{af}[a]")
    else:
        graph = f"[0:v]{vf}[v];[0:a]{af}[a]"
    run("ffmpeg", "-v", "error", "-y", "-i", str(src), "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-c:a", "aac", "-b:a", "256k", "source.mp4")
    key.write_text(k)

# 5. Music bed trimmed to length, then the composition from the template.
run("ffmpeg", "-v", "error", "-y", "-i", str(src_of(f"assets/music/{cfg['music']}.mp3")), "-af",
    f"aloop=loop=-1:size=2e9,atrim=0:{duration},afade=t=in:d=1,afade=t=out:st={duration - 3.5}:d=3.5,"
    "aformat=sample_rates=48000:channel_layouts=stereo", "assets/music.wav")  # fades over the tail too
h = cfg["hook"]
page = (preset / "index.html").read_text()
for k, v in {"DURATION": duration, "VIDEO_DURATION": video_duration, "VIDEO": "source.mp4", "MUSIC_VOLUME": cfg.get("music_volume", 0.32),
             "HOOK_1": html.escape(h["line1"]), "HOOK_2": html.escape(h["line2"]), "HOOK_SUB": html.escape(h["sub"])}.items():
    page = page.replace("{{" + k + "}}", str(v))
page = page.replace("<!-- SFX:BEGIN -->", "<!-- SFX:BEGIN -->\n" + tags + "\n      ")
(proj / "index.html").write_text(page)

# 6. Carve the music around the voice (hyperframes-audio), validate, render.
if not (proj / "node_modules/@hyperframes/core").exists():
    run("npm", "install", "--silent")
run("node", str(src_of("tools/carve.mjs")), "--comp", "index.html", "--bed", "music", "--voice", "a-roll")
run("npx", "--yes", HF, "check")
print(f"{len(chunks)} caption chunks, {len(beats)} beats, {len(sfx)} sfx, {duration}s")
if "--render" in sys.argv:
    out = WORK / "output" / cfg["name"] / cfg["preset"] / f"{cfg['name']}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    run("npx", "--yes", HF, "render", "--crf", str(cfg.get("crf", 23)), "-o", str(out))  # CRF 23: ~1/3 the size of the default 16, same resolution
    shutil.rmtree(proj / "renders", ignore_errors=True)
    # The video's own credits (images, footage), the music bed actually used, then the preset's (fonts, sound effects).
    # A music credit is the line "- <music>.mp3: ..." in the preset's CREDITS.txt, else in the shared assets/CREDITS.txt.
    line = re.compile(rf"^- {re.escape(cfg['music'])}\.mp3: (.+)$", re.M)
    music = next((m.group(1) for f in (preset / "CREDITS.txt", SKILL / "assets/CREDITS.txt")
                  if f.exists() and (m := line.search(f.read_text()))), None)
    if not music:
        print(f"warning: no credit for music {cfg['music']!r}; add '- {cfg['music']}.mp3: ...' to the preset's CREDITS.txt")
    credits = [f.read_text().strip() for f in (vdir / "CREDITS.txt",) if f.exists()]
    credits += [f"Music: {music}"] if music else []
    credits += [f.read_text().strip() for f in (preset / "CREDITS.txt",) if f.exists()]
    if credits:
        (out.parent / "CREDITS.txt").write_text("\n\n".join(credits) + "\n")
    print(f"rendered {out}")

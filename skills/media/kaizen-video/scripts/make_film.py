"""Build (and optionally render) a film made from nothing: narration, pictures, music, sound effects.

    python3 scripts/make_film.py videos/<name> [--render] [--format 9x16|16x9|4x5]

Run from the project folder. videos/<name>/ holds film.json (storyboard + brand), lines.json (the script),
words.json (word timings from vo.py), the voice files vNN.mp3 and the pictures. Writes the HyperFrames project
into videos/<name>/film/; with --render, scripts/master.sh renders it, masters the loudness and writes
output/<name>/<preset>/<name>.mp4 with the .srt, thumbnail and credits.

film.json: "preset" (a folder under presets/ with a style.json, e.g. film-cinematic-drama), "format"
("9x16" default, "16x9", or "4x5" for an Instagram feed post), "beats", "brand", "labels", "cta", "logo", "qr", "music" (a bundled track name;
without it videos/<name>/music.mp3 is used). The preset is found in ./presets/, $KAIZEN_VIDEO_PRESETS
(default ~/.kaizen/video-presets/), then the skill's presets/, like make_tiktok.py.
--format overrides film.json's format for one build and adds -<format> to the output name, so one film can be
rendered for several shapes (the Video page in kaizen web does this) without one render replacing another.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
WORK = Path.cwd()
HF = "hyperframes@0.8.176"
FPS = 30
HOME = Path(os.environ.get("KAIZEN_VIDEO_HOME", Path.home() / ".kaizen/kaizen-video"))
SIZES = {"9x16": (1080, 1920, "portrait"), "16x9": (1920, 1080, "landscape"), "4x5": (1080, 1350, "portrait")}

vdir = Path(sys.argv[1]).resolve()
proj = vdir / "film"
film = json.loads((vdir / "film.json").read_text())
words = json.loads((vdir / "words.json").read_text())
forced = sys.argv[sys.argv.index("--format") + 1] if "--format" in sys.argv[:-1] else None
fmt = forced or film.get("format", "9x16")
if fmt not in SIZES:
    sys.exit(f"film.json format {fmt!r} must be one of {', '.join(SIZES)}")
W, H, RES = SIZES[fmt]
LANG = film.get("language", "id")

# 1. Preset: a folder with style.json.
dirs = [WORK / "presets", Path(os.environ.get("KAIZEN_VIDEO_PRESETS", Path.home() / ".kaizen/video-presets")), SKILL / "presets"]
want = film["preset"]
preset = next((d / n for n in (want, "film-" + want) for d in dirs if (d / n / "style.json").exists()), None)
if not preset:
    names = sorted({p.parent.name for d in dirs if d.exists() for p in d.glob("*/style.json")})
    sys.exit(f"preset {want!r} not found in {', '.join(map(str, dirs))}; available: {', '.join(names)}")
print(f"preset {preset}")
style = json.loads((preset / "style.json").read_text())
brand = film.get("brand", {})
style["palette"] = {**style["palette"], **brand.get("palette", {})}
style["fonts"] = {**style["fonts"], **brand.get("fonts", {})}
pace = style["pace"]
shutil.rmtree(proj / "assets", ignore_errors=True)
for d in ("img", "video", "sfx", "fonts"):
    (proj / "assets" / d).mkdir(parents=True)


def probe(f, entry, kind="format"):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", f"{kind}={entry}", "-of", "csv=p=0", str(f)])
    return out.decode().strip()


def run(*cmd, cwd=proj):
    subprocess.run(cmd, check=True, cwd=cwd)


# 2. Timeline: every beat is lead + its voice line + tail (+ hold), in whole frames, one after another.
t, beats = 0, []
for n, b in enumerate(film["beats"]):
    v = b.get("vo")
    if v and v not in words:
        sys.exit(f"beat {n + 1}: voice {v!r} is not in words.json; run vo.py first")
    frames = round(((pace["lead"] + words[v]["dur"] + pace["tail"]) if v else 0) * FPS + b.get("hold", 0) * FPS)
    if frames:
        beats.append({**b, "n": n, "start": t / FPS, "len": frames / FPS, "dur": words[v]["dur"] if v else 0})
    else:
        print(f"warning: beat {n + 1} ({b['kind']}) has no voice and no hold, so it is skipped")
    t += frames
total = t / FPS
reveal = next((b["start"] for b in beats if b["kind"] == "reveal"), total / 2)

# 3. Pictures, footage, logo, QR into the project (a photo name may be a stem: intake writes <stem>-9x16.jpg).
def stage(name, sub):
    if not name:
        return name
    src = vdir / name
    for tag in (fmt, "9x16") if fmt == "4x5" else (fmt,):   # a film intaken before 4x5 existed uses its 9x16 crops
        if not src.exists():
            src = vdir / f"{Path(name).stem}-{tag}.jpg"
    if not src.exists():
        sys.exit(f"file {name!r} not found in {vdir}")
    flat = re.sub(r"[\\/]", "_", str(src.relative_to(vdir)))
    shutil.copy(src, proj / "assets" / sub / flat)
    return f"assets/{sub}/{flat}"


for b in beats:
    b["img"], b["video"] = stage(b.get("img"), "img"), stage(b.get("video"), "video")
    if b.get("panels"):
        b["panels"] = [{**p, "img": stage(p["img"], "img")} for p in b["panels"]]
    if b["kind"] == "shot" and b["img"] and not b.get("shotRatio"):
        b["shotRatio"] = round(int(probe(proj / b["img"], "width", "stream")) / int(probe(proj / b["img"], "height", "stream")), 3)
labels = {"source": "Sumber" if LANG == "id" else "Source", "next": "Langkah berikutnya" if LANG == "id" else "Next step", **film.get("labels", {})}

# 4. Captions: subtitle chunks of up to 7 words (also the .srt cues), or kinetic groups of 2-3 words.
def chunks(ws):
    out, cur = [], []
    for w in ws:
        cur.append(w)
        if len(cur) >= 7 or re.search(r"[.,?!]$", w["w"]):
            out.append(cur)
            cur = []
    return out + ([cur] if cur else [])


def groups(ws):
    out, i = [], 0
    while i < len(ws):
        k = 2 if len("".join(w["w"] for w in ws[i:i + 3])) > 16 else 3
        out.append(ws[i:i + k])
        i += k
    return out


captions, cues = [], []
for b in beats:
    if not b.get("vo"):
        continue
    t0 = b["start"] + pace["lead"]
    ws = [{"w": w["w"], "s": round(t0 + w["s"], 3), "e": round(t0 + w["e"], 3)} for w in words[b["vo"]]["words"]]
    cues += [[c[0]["s"], c[-1]["e"] + 0.2, " ".join(w["w"] for w in c)] for c in chunks(ws)]
    if b["kind"] == "cta" or style["captions"] == "none":
        continue
    gs = chunks(ws) if style["captions"] == "subtitle" else groups(ws)
    for i, g in enumerate(gs):
        nxt = gs[i + 1][0]["s"] if i + 1 < len(gs) else min(g[-1]["e"] + 0.4, b["start"] + b["len"])
        captions.append({"s": round(max(b["start"], g[0]["s"] - (0.05 if i == 0 else 0)), 3), "e": round(nxt, 3), "words": g})
for a, c in zip(cues, cues[1:]):
    a[1] = round(min(a[1], c[0] - 0.02), 3)  # no overlapping cues
proj.mkdir(exist_ok=True)
(proj / "cues.json").write_text(json.dumps(cues, ensure_ascii=False))

film_data = {"fmt": fmt, "W": W, "H": H, "language": LANG, "style": style, "labels": labels, "total": total, "beats": beats, "captions": captions,
             "cta": film.get("cta"), "logo": stage(film.get("logo"), "img"), "logoOnLight": stage(film.get("logoOnLight"), "img"), "qr": stage(film.get("qr"), "img")}
(proj / "film-data.js").write_text("window.FILM = " + json.dumps(film_data, ensure_ascii=False) + ";\n")

# 5. Audio: the voice lines on one track, the music bed with the style's levels, sound effects and room tone.
def ffmpeg(*args):
    run("ffmpeg", "-v", "error", "-y", *args)


ins, graph = [], []
for i, b in enumerate(x for x in beats if x.get("vo")):
    ins += ["-i", str(vdir / f"{b['vo']}.mp3")]
    ms = round((b["start"] + pace["lead"]) * 1000)
    graph.append(f"[{i}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=start={words[b['vo']]['offset']},asetpts=PTS-STARTPTS,adelay={ms}|{ms}[a{i}]")
if not graph:
    sys.exit("no beat has a voice line (vo); a film needs narration")
mix = "".join(f"[a{i}]" for i in range(len(graph)))
ffmpeg(*ins, "-filter_complex", ";".join(graph) + f";{mix}amix=inputs={len(graph)}:normalize=0:duration=longest,apad[o]",
       "-map", "[o]", "-t", str(total), "-ar", "48000", "assets/vo.wav")

music = style["music"]
track = vdir / music["track"]
if film.get("music"):
    track = SKILL / "assets/music" / f"{film['music']}.mp3"
if not track.exists():
    sys.exit(f"no music: put {music['track']} in {vdir} (scripts/music.sh) or set film.json \"music\" to one of: "
             + ", ".join(sorted(p.stem for p in (SKILL / "assets/music").glob("*.mp3"))))
pts = [(0, 0), (1, music["base"]), (max(1, reveal - 0.5), music["base"]), (reveal + 1 / 3, music["lift"]), (reveal + 3, music["base"] + 0.04),
       (total - 2, music["base"] + 0.04), (total, 0)]
pts = [p for i, p in enumerate(pts) if i == 0 or p[0] > pts[i - 1][0]]  # a short film can fold the points back on themselves
expr = f"{pts[-1][1]}"
for (t0, a0), (t1, a1) in reversed(list(zip(pts, pts[1:]))):
    expr = f"if(lt(t,{t1}),{a0}+({a1}-{a0})*(t-{t0})/({t1}-{t0}),{expr})"
ffmpeg("-i", str(track), "-af", f"aloop=loop=-1:size=2e9,atrim=0:{total},loudnorm=I=-16:TP=-1.5,volume='{expr}':eval=frame,aformat=sample_rates=48000:channel_layouts=stereo", "assets/music.wav")

LIB = HOME / "sfx"


def sound(name):
    def find():
        return next((f for d in (vdir / "sfx", preset / "assets/sfx", LIB) for e in (".wav", ".mp3") if (f := d / (name + e)).exists()), None)
    if not find() and not (LIB / "whoosh.mp3").exists():  # make the shared library once, synthesized (no ElevenLabs credits spent unless SFX_PROVIDER says so)
        run("python3", str(SKILL / "scripts/sfx.py"), "--provider", os.environ.get("SFX_PROVIDER", "synth"))
    f = find()
    if not f:
        sys.exit(f"sound {name!r} not found in {vdir / 'sfx'}, {preset / 'assets/sfx'} or {LIB}")
    shutil.copy(f, proj / "assets/sfx" / f.name)
    return f.name


fx = style["sfx"]
sfx, amb = [], []   # (file, start, volume)
for i, b in enumerate(beats):
    cut = fx["reveal"] if b["kind"] == "reveal" else fx["question"] if b["kind"] == "question" else fx["cut"] if i else ""
    if cut:
        sfx.append((sound(cut), b["start"], 0.7 if b["kind"] == "reveal" else 0.35))
    sfx += [(sound(s), b["start"] + pace["lead"], 0.45) for s in b.get("sfx", [])]
    if fx["text"] and b.get("title") and i:
        sfx.append((sound(fx["text"]), b["start"] + pace["lead"] + 0.2, 0.25))
    if b.get("ambience"):
        a = sound(b["ambience"])
        ffmpeg("-stream_loop", "-1", "-i", f"assets/sfx/{a}", "-t", str(b["len"]), "-af", f"afade=t=in:d=0.3,afade=t=out:st={max(0, b['len'] - 0.3)}:d=0.3,aformat=sample_rates=48000:channel_layouts=stereo", f"assets/amb-{i}.wav")
        amb.append((f"amb-{i}.wav", b["start"], b["len"]))
tracks, tags = {}, []   # greedy track numbers from 3, so no two sounds overlap on one track (HyperFrames lint)


def place(tag, start, dur):
    k = next(k for k in range(3, 99) if tracks.get(k, -1) <= start)
    tracks[k] = start + dur
    tags.append(tag.replace("TRACK", str(k)))


for i, (name, start, vol) in enumerate(sorted(sfx, key=lambda x: x[1])):
    d = round(float(probe(proj / "assets/sfx" / name, "duration")), 2)
    place(f'<audio id="sfx-{i}" src="assets/sfx/{name}" data-start="{start:.2f}" data-duration="{d}" data-track-index="TRACK" data-volume="{vol}"></audio>', start, d)
for i, (name, start, dur) in enumerate(amb):
    place(f'<audio id="amb-{i}" src="assets/{name}" data-start="{start:.2f}" data-duration="{dur}" data-track-index="TRACK" data-volume="0.18"></audio>', start, dur)
audio = "\n      ".join([f'<audio id="vo" src="assets/vo.wav" data-start="0" data-duration="{total}" data-track-index="1"></audio>',
                        f'<audio id="music" src="assets/music.wav" data-start="0" data-duration="{total}" data-track-index="2"></audio>'] + tags)

# 6. Fonts (the style's, plus Inter for kinetic captions), the page, carve the music around the voice, check.
faces = []
fonts = set(style["fonts"].values()) | ({"Inter"} if style["captions"] == "kinetic" else set())
for fam in sorted(fonts):
    stem = fam.replace(" ", "")
    for suffix, slant in (("", "normal"), ("-Italic", "italic")):
        src = next((f for d in (preset / "assets/fonts", SKILL / "assets/film-fonts", SKILL / "assets/fonts") if (f := d / f"{stem}{suffix}.ttf").exists()), None)
        if src:
            shutil.copy(src, proj / "assets/fonts" / src.name)
            faces.append(f'@font-face {{ font-family: "{fam}"; src: url("assets/fonts/{src.name}"); font-weight: 100 900; font-style: {slant}; }}')
        elif not suffix:
            sys.exit(f"font {fam!r} not found: add {stem}.ttf to the preset's assets/fonts or the skill's assets/film-fonts")
page = (SKILL / "film.html").read_text()
for k, v in {"W": W, "H": H, "RES": RES, "DURATION": total, "LANG": LANG}.items():
    page = page.replace("{{" + k + "}}", str(v))
page = page.replace("/*FONTS*/", "\n      ".join(faces)).replace("<!-- AUDIO -->", audio)
(proj / "index.html").write_text(page)
shutil.copy(SKILL / "hyperframes.json", proj / "hyperframes.json")
(proj / "package.json").write_text(json.dumps({"name": "kaizen-film", "private": True, "type": "module", "devDependencies": {"@hyperframes/core": HF.split("@")[1]}}, indent=2))
if not (proj / "node_modules/@hyperframes/core").exists():
    run("npm", "install", "--silent")
run("node", str(SKILL / "tools/carve.mjs"), "--comp", "index.html", "--bed", "music", "--voice", "vo")
run("npx", "--yes", HF, "check")
print(f"{len(beats)} beats, {len(captions)} caption groups, {len(sfx)} sfx, {fmt}, {total}s")

# 7. Credits and master data, then render + master with --render.
name = film.get("name", vdir.name) + (f"-{fmt}" if forced else "")
line = re.compile(rf"^- {re.escape(music['track'] if not film.get('music') else film['music'])}\.mp3: (.+)$", re.M)
bundled = (SKILL / "assets/CREDITS.txt").read_text() if (SKILL / "assets/CREDITS.txt").exists() else ""
credits = [f.read_text().strip() for f in [vdir / "CREDITS.txt", *sorted(vdir.glob("CREDITS-*.txt"))] if f.exists()]
if film.get("music") and (m := line.search(bundled)):
    credits.append("Music: " + m.group(1))
credits += [f.read_text().strip() for f in (preset / "CREDITS.txt",) if f.exists()]
credits.append("Voice and sound effects: see the voice provider in film.json (ElevenLabs commercial use requires a paid plan).")
(proj / "CREDITS.txt").write_text("\n\n".join(credits) + "\n")
(proj / "meta.json").write_text(json.dumps({"name": name, "folder": film.get("name", vdir.name), "preset": preset.name, "loudness": style["loudness"]}))
if "--render" in sys.argv:
    run("bash", str(SKILL / "scripts/master.sh"), str(vdir), cwd=WORK)

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
"style" overrides keys of the preset's style.json for this film (a dict merges into the preset's, e.g.
{"pace": {"lead": 0, "tail": 0}}). A footage preset (a folder with index.html) works too: the film is
rendered once with no captions and no music, then make_tiktok.py styles that video like recorded footage
(videos/<name>/footage-bridge/; film.json "hook" {"line1", "line2", "sub"} sets its hook, else the first words).
The film's scenes become the template's (title, stat as a big numeral, question as "?", items as item rows, cta as
end), each at the start of its line; film.json "footage_beats" (template beats, placed with "t" seconds or "word")
replaces that mapping, "mascot" (a picture in the video folder) adds the template's corner mascot, and a beat's "pics"
(pictures in the video folder) feed the picture scenes after its headline. The clip card is hidden (no real footage).
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
# A footage preset: build pass 1 in a plain base style with no captions, no music and no cut sounds; it is styled after.
footage = None if preset else next((d / want for d in dirs if (d / want / "index.html").exists()), None)
if footage:
    if fmt != "9x16" and forced:  # the Video page renders every shape the platforms need; this one has no other shape
        print(f"skipped {fmt}: footage preset {want!r} is 9:16 only")
        sys.exit(0)
    if fmt != "9x16":
        sys.exit(f"footage preset {want!r} is 9:16 only; set film.json format to 9x16")
    preset = next(d / "film-viral-social" for d in dirs if (d / "film-viral-social" / "style.json").exists())
if not preset:
    names = sorted({p.parent.name for d in dirs if d.exists() for p in d.glob("*/style.json")})
    sys.exit(f"preset {want!r} not found in {', '.join(map(str, dirs))}; available: {', '.join(names)}")
print(f"preset {preset}")
style = json.loads((preset / "style.json").read_text())
over = {**film.get("style", {}), **({"captions": "none", "music": {"base": 0, "lift": 0}, "sfx": {"cut": "", "text": "", "reveal": "", "question": ""}} if footage else {})}
for k, v in over.items():
    style[k] = {**style.get(k, {}), **v} if isinstance(v, dict) else v
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
canvas = style.get("engine") == "canvas"   # a canvas film: one large canvas and a camera (canvas.html, references/canvas.md)
if canvas:
    for b in film["beats"]:
        b.setdefault("kind", "canvas")
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


scenes = []
if footage:
    # Pass 1 carries pictures only: the footage template draws the words, from these scenes.
    scenes = [dict(b) for b in beats]
    keep = ("n", "start", "len", "dur", "vo", "hold", "ambience", "sfx", "img", "video", "shotRatio")
    beats = [{**{k: b[k] for k in keep if k in b}, "kind": b["kind"] if b["kind"] in ("footage", "shot") else "media",
              **({"img": b["panels"][0]["img"]} if b.get("panels") and not b.get("img") else {})} for b in beats]
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


captions, cues, spoken = [], [], []
for b in beats:
    if not b.get("vo"):
        continue
    t0 = b["start"] + pace["lead"]
    ws = [{"w": w["w"], "s": round(t0 + w["s"], 3), "e": round(t0 + w["e"], 3)} for w in words[b["vo"]]["words"]]
    spoken += ws
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

# A canvas film's pictures, and its actions' times: "at" is seconds from the beat's start, or "word:<w>" the moment
# the beat's first word starting with <w> is spoken.
CANVAS_SFX = {"move": "whoosh", "pop": "pop", "stamp": "stamp", "scrub": "tick", "morph": "shutter", "fill": "reveal"}
if canvas:
    if fmt != "9x16" or not film.get("canvas"):
        sys.exit("a canvas preset needs film.json \"canvas\" (see references/canvas.md) and the 9x16 format")
    for e in film["canvas"]["elements"]:
        if e.get("img"):
            e["img"] = stage(e["img"], "img")
        for fr in e.get("frames", []):
            if fr.get("img"):
                fr["img"] = stage(fr["img"], "img")
    for b in beats:
        bw = [{"w": w["w"], "s": b["start"] + pace["lead"] + w["s"]} for w in words[b["vo"]]["words"]] if b.get("vo") else []
        for a in b.get("do", []):
            at = a.get("at", 0)
            if isinstance(at, str) and at.startswith("word:"):
                key = at[5:].lower()
                hit = next((w["s"] for w in bw if w["w"].lower().strip(",.?!\"'").startswith(key)), None)
                if hit is None:
                    sys.exit(f"beat {b['n'] + 1}: no word starting with {key!r} for {a}")
                a["t"] = round(hit, 3)
            else:
                a["t"] = round(b["start"] + float(at), 3)

film_data = {"fmt": fmt, "W": W, "H": H, "language": LANG, "style": style, "labels": labels, "total": total, "beats": beats, "captions": captions,
             "cta": film.get("cta"), "logo": stage(film.get("logo"), "img"), "logoOnLight": stage(film.get("logoOnLight"), "img"), "qr": stage(film.get("qr"), "img"),
             **({"canvas": film["canvas"], "mascot": stage(film.get("mascot"), "img")} if canvas else {})}
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
if footage and not track.exists():  # pass 1 is silent music; any bundled track will do
    track = SKILL / "assets/music/sunny.mp3"
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
    for a in b.get("do", []) if canvas else []:   # each camera action carries its sound, unless "sfx": "" turns it off
        name = a.get("sfx", CANVAS_SFX.get(a["act"], ""))
        if name:
            sfx.append((sound(name), a["t"] + (0.35 if a["act"] == "stamp" else 0), a.get("vol", 0.4)))
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
page = (SKILL / ("canvas.html" if canvas else "film.html")).read_text()
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
if footage:
    # ponytail: pass 1 renders on every build, so a footage preset's build takes a render longer; cache it if that hurts.
    tmp = proj / ".render-tmp"
    tmp.mkdir(exist_ok=True)
    subprocess.run(["npx", "--yes", HF, "render", "--crf", "16", "-o", str(proj / "pass1.mp4")], check=True, cwd=proj, env={**os.environ, "TMPDIR": str(tmp)})
    shutil.rmtree(tmp, ignore_errors=True)
    shutil.rmtree(proj / "renders", ignore_errors=True)
    bridge = vdir / "footage-bridge"
    bridge.mkdir(exist_ok=True)
    (bridge / "words.json").write_text(json.dumps({"segments": [{"words": [{"word": w["w"], "start": w["s"], "end": w["e"]} for w in spoken]}]}, ensure_ascii=False))
    # The film's scenes as the template's, paced like an explainer (or film.json "footage_beats" as written):
    # each scene opens on a headline scene, then picture scenes change at its phrase breaks, about every 2 s.
    (bridge / "images").mkdir(exist_ok=True)

    def copy_pic(name, staged=None):
        src = proj / staged if staged else next((f for f in (vdir / name, vdir / f"{Path(name).stem}-9x16.jpg") if f.exists()), None)
        if not src:
            sys.exit(f"picture {name!r} not found in {vdir}")
        shutil.copy(src, bridge / "images" / src.name)
        return src.name

    def headline(text):
        if len(text) > 14:  # the template shrinks longer headlines to unreadable sizes
            print(f"warning: headline {text!r} is over 14 characters; shown as the serif line instead")
            return "", text
        return text.upper(), ""

    mapped, cursor = [], 3.2   # the hook holds the first 3 s
    for i, s in enumerate(scenes):
        start, end = max(s["start"] + pace["lead"], cursor), s["start"] + s["len"]
        if end - start < 0.8:
            continue
        cursor = end
        if s["kind"] == "cta":
            c = film.get("cta") or {}
            mapped.append({"kind": "end", "t": round(start, 3), "title": s.get("title") or c.get("title", ""), "sub": c.get("url") or c.get("sub", "") or s.get("sub", "")})
            continue
        if s.get("items"):
            mapped += [{"kind": "item", "t": round(start + 0.3 + (end - start - 0.6) * k / len(s["items"]), 3), "label": f"{k + 1:02d}", "text": it,
                        **({"head": s["title"]} if k == 0 and s.get("title") else {})} for k, it in enumerate(s["items"])]
            continue
        pics = ([copy_pic(beats[i]["img"], beats[i]["img"])] if beats[i].get("img") else []) + [copy_pic(n) for n in s.get("pics", [])]
        head = {"kind": "title", "t": round(start, 3), "kicker": s.get("kick", "")}
        if s["kind"] == "stat" and s.get("stat"):
            st = s["stat"][0]
            head["title"], long = headline(st.get("suffix", "").strip())
            head.update(big=str(st["value"]), sub=" ".join(x for x in (long, st.get("label", "")) if x))
        elif s["kind"] == "question":
            head.update(big="?", sub=s.get("title", ""))
        else:
            head["title"], long = headline(s.get("title", ""))
            head["sub"] = long or s.get("sub", "")
        # Phrase breaks after the headline: a word that starts 1.6 s or more after the last break, sooner at punctuation.
        cuts, last, prev = [], start + min(2.2, end - start), {"w": "-"}
        for w in (w for w in spoken if last + 0.3 < w["s"] < end - 0.8):
            if w["s"] - last >= 2.4 or (w["s"] - last >= 1.6 and prev["w"][-1] in ",.?!;:"):
                cuts.append(w["s"])
                last = w["s"]
            prev = w
        if not pics:  # nothing to show between headlines: the headline holds the whole scene
            mapped.append({**head, "dur": round(end - start, 3)})
            continue
        stops = [start + min(2.2, end - start)] + cuts + [end]
        # No picture holds longer than 2.5 s: split a long gap evenly where no phrase break fell.
        stops = [round(a + (b - a) * k / -(-(b - a) // 2.5), 3) for a, b in zip(stops, stops[1:]) for k in range(int(-(-(b - a) // 2.5)))] + [end]
        mapped.append({**head, "dur": round(stops[0] - start, 3), "img": pics[0]})
        mapped += [{"kind": "photo", "t": round(a, 3), "dur": round(b - a, 3), "img": pics[(k + 1) % len(pics)]} for k, (a, b) in enumerate(zip(stops, stops[1:])) if b - a > 0.5]
    first = next((b["img"] for b in mapped if b.get("img")), None)
    if first:  # something to look at under the hook
        mapped.insert(0, {"kind": "photo", "t": 0.2, "dur": 2.95, "img": first})
    if film.get("mascot"):
        mapped.append({"kind": "mascot", "t": 0.3, "img": copy_pic(film["mascot"])})
    fb = film.get("footage_beats", mapped)
    for b in film.get("footage_beats", []):
        if b.get("img"):
            copy_pic(b["img"])
    first = [w["w"] for w in spoken]
    hook = film.get("hook") or {"line1": " ".join(first[:3]).upper(), "line2": " ".join(first[3:6]).upper(), "sub": ""}
    own = [f.read_text().strip() for f in [vdir / "CREDITS.txt", *sorted(vdir.glob("CREDITS-*.txt"))] if f.exists()]
    if own:  # make_tiktok.py puts the video's own credits first in the render's CREDITS.txt
        (bridge / "CREDITS.txt").write_text("\n\n".join(own) + "\n")
    # One plan segment per scene, back to back over the whole film: the template treats each as a jump cut
    # (card tilt, lists leave), and the last one keeps the tail after the last word.
    (bridge / "plan.json").write_text(json.dumps({"segments": [{"start_time": b["start"], "end_time": b["start"] + b["len"]} for b in beats]}))
    (bridge / "config.json").write_text(json.dumps({"name": film.get("name", vdir.name), "preset": want, "video": str(proj / "pass1.mp4"),
                                                    "words": str(bridge / "words.json"), "plan": str(bridge / "plan.json"), "hook": hook, "music": film.get("music", "sunny"),
                                                    "beats": fb, "card": False, "tail": 1.5 if any(b.get("kind") == "end" for b in fb) else 0}, ensure_ascii=False, indent=1))
    print(f"footage preset {want}: styling pass 1 with make_tiktok.py")
    run("python3", str(SKILL / "scripts/make_tiktok.py"), str(bridge), *(["--render"] if "--render" in sys.argv else []), cwd=WORK)
elif "--render" in sys.argv:
    run("bash", str(SKILL / "scripts/master.sh"), str(vdir), cwd=WORK)

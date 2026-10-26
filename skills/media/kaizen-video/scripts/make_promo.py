"""Build (and optionally render) an app-promo video: a product filmed in use, framed in its own devices.

    python3 scripts/make_promo.py videos/<name> [--render]

Run from the project folder. videos/<name>/ holds promo.json (the brief, references/promo.md) and rec/,
the recordings from record.mjs (or the user's screen recordings with a rec/<clip>.json beside them).
Writes the HyperFrames project into videos/<name>/promo/, runs `hyperframes check` and snapshots one frame
per step into promo/check/; with --render it renders, levels the sound to -14 LUFS (true peak -1.5 dBTP)
and writes output/<name>/<preset>/<name>.mp4 with CREDITS.txt.

promo.json: "preset" (default app-promo), "product", "tagline", "cta", "hook" (2-3 lines; the last word
lands in the accent), "brand" {"logo", "bg", "ink", "accent", "muted", "font"}, "music" (a bundled track
name, or "none"), "steps": [{"clip", "caption" (*word* is the accent), "from", "to" (seconds of the clip),
"with" (a second clip on another device, shown together), "punch" ([] for none, or [{"at", "x", "y",
"zoom", "hold"}] in clip seconds and CSS px)}].
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HF = "hyperframes@0.8.176"
SKILL = Path(__file__).resolve().parent.parent

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if not args:
    sys.exit(__doc__)
vdir = Path(args[0])
render = "--render" in sys.argv
brief = json.loads((vdir / "promo.json").read_text())
want = brief.get("preset", "app-promo")
if not re.fullmatch(r"[A-Za-z0-9][\w.-]*", want) or ".." in want:
    sys.exit(f"preset {want!r}: a folder name, not a path")
dirs = [Path("presets"), Path(os.environ.get("KAIZEN_VIDEO_PRESETS", Path.home() / ".kaizen/video-presets")), SKILL / "presets"]
preset = next((d / want for d in dirs if (d / want / "preset.json").exists()), None)
if not preset:
    sys.exit(f"template preset {want!r} not found (a folder with preset.json)")
name = vdir.name
proj = vdir / "promo"


def safe(n, what):
    """A file name from the brief: inside the video folder, never absolute or with '..'."""
    if not n or Path(n).is_absolute() or ".." in Path(n).parts:
        sys.exit(f"{what} {n!r}: give a name inside {vdir}, not a path out of it")
    return n


def clip(c):
    safe(c, "clip")
    meta = vdir / "rec" / f"{c}.json"
    if not meta.exists() or not (vdir / "rec" / f"{c}.mp4").exists():
        sys.exit(f"clip {c!r}: rec/{c}.mp4 and rec/{c}.json are needed (record.mjs makes both)")
    return json.loads(meta.read_text())


# ---- Brand
B = brief.get("brand", {})
bg, ink, accent = B.get("bg", "#0c162f"), B.get("ink", "#eef2fa"), B.get("accent", "#6d8cff")
font = B.get("font", "Inter")
dark = int(bg.lstrip("#")[:2], 16) + int(bg.lstrip("#")[2:4], 16) + int(bg.lstrip("#")[4:6], 16) < 384
css = f""":root {{ --bg: {bg}; --ink: {ink}; --accent: {accent}; --font: "{font}";
        --muted: {B.get("muted", f"color-mix(in srgb, {ink} 62%, {bg})")}; --dim: color-mix(in srgb, {ink} 22%, {bg});
        --bezel: color-mix(in srgb, {ink} {14 if dark else 80}%, {bg}); --bezel-edge: color-mix(in srgb, {ink} {24 if dark else 30}%, {bg}); }}"""
esc = html.escape


def words(text, last_id=None):
    """Words as spans; *word* is the accent; "/" breaks the line."""
    out = []
    for line in text.split("/"):
        ws = line.split()
        out.append(" ".join(f"<span>{'<b>' + esc(w.strip('*')) + '</b>' if w.startswith('*') else esc(w)}</span>" for w in ws))
    s = "<br />".join(out)
    if last_id:
        s = re.sub(r"<span>([^<]*)</span>$", rf'<span id="{last_id}">\1</span>', s)
    return s


def fit(text, size, width=1000):
    return int(min(size, width / max(1, len(text) * 0.58)))


# ---- Device geometry (9:16 frame, 1080 x 1920). Screens keep the recording's aspect.
def frames(step, sid):
    """HTML for the step's device(s), with its clips and tap marks; returns (html, taps, points)."""
    a = clip(step["clip"])
    b = clip(step["with"]) if step.get("with") else None
    t0, t1 = step.get("from", 0), step.get("to", a["seconds"])
    dur = t1 - t0
    parts, taps, points, conv = [], [], [], []

    def device(c, meta, box, small=False):
        kind = meta["device"]
        x, y, w = box
        if kind == "tablet":   # a phone-style bezel, as wide as the frame's height allows (screen at most 1388 tall)
            sw = min(w - 28, round(1388 * meta["cssW"] / meta["cssH"]))
            w = sw + 28
            x, y = (1080 - w) // 2, 440
        if kind in ("phone", "tablet"):
            sw = w - 28
            sh = round(sw * meta["cssH"] / meta["cssW"])
            ox, oy, k = x + 14, y + 14, sw / meta["cssW"]
            body = (f'<div class="s-phone" style="left:{x}px;top:{y}px;width:{w}px;height:{sh + 28}px">'
                    f'<div class="scr" style="width:{sw}px;height:{sh}px">')
        else:
            sh = round(w * meta["cssH"] / meta["cssW"])
            ox, oy, k = x, y + 64, w / meta["cssW"]
            # A web product sits in a browser with its real URL; a native app ("app": the user's recording) in a titled window.
            bar = (f'<i></i><i></i><i></i><span class="ttl">{esc(brief.get("product", ""))}</span>' if kind == "app"
                   else f'<i></i><i></i><i></i><span class="url">{esc(brief.get("url", ""))}</span>')
            body = (f'<div class="s-win" style="left:{x}px;top:{y}px;width:{w}px"><div class="bar">{bar}</div>'
                    f'<div class="scr" style="width:{w}px;height:{sh}px">')
        conv.append((ox, oy, k))
        vid = f"{sid}-{c}"
        body += (f'<video id="{vid}" class="clip" src="assets/rec/{c}.mp4" muted playsinline data-start="0" '
                 f'data-duration="{dur:.3f}" data-media-start="{t0:.3f}" data-track-index="0"></video>')
        for i, tp in enumerate(m for m in meta["taps"] if t0 <= m["t"] < t1):
            tid = f"{vid}-t{i}"
            body += f'<div class="s-tap{" sm" if small else ""}" id="{tid}" style="left:{tp["x"] * k:.0f}px;top:{tp["y"] * k:.0f}px"></div>'
            taps.append([tid, round(tp["t"] - t0, 3)])
            points.append((tp["t"] - t0, ox + tp["x"] * k, oy + tp["y"] * k, kind))
        return body + "</div></div>"

    if b:   # duo: the window large, the phone overlapping at the bottom right, both playing the same task
        win, ph = (a, b) if a["device"] != "phone" else (b, a)
        wc, pc = (step["clip"], step["with"]) if a is win else (step["with"], step["clip"])
        parts.append(device(wc, win, (30, 470, 900)))
        parts.append(device(pc, ph, (690, 860, 360), small=True))
    elif a["device"] == "phone":
        parts.append(device(step["clip"], a, (206, 440, 668)))
    else:
        parts.append(device(step["clip"], a, (40, 560, 1000)))
    # CSS px -> frame px for hand-placed punch-ins: the step's one device, or the phone of a duo (drawn last).
    return f'<div id="{sid}-dev">{"".join(parts)}</div>', taps, points, dur, a["device"] if not b else "duo", conv[-1]


def punches(step, points, dur, dev, conv):
    """Punch in on a tap when the UI then has time to act (the next tap is 1.6 s or more away).
    With two devices on screen only the phone's taps lead, and gently, so the window stays in frame."""
    if "punch" in step:
        ox, oy, k = conv   # x/y are CSS px of the step's clip, like the tap log
        return [[p["at"] - step.get("from", 0), round(ox + p["x"] * k), round(oy + p["y"] * k), p.get("zoom", 1.35), p.get("hold", 2.0)] for p in step["punch"]]
    if dev == "duo":
        points = [p for p in points if p[3] == "phone"]
    out, pts = [], sorted(points)
    for i, (t, x, y, kind) in enumerate(pts):
        nxt = pts[i + 1][0] if i + 1 < len(pts) else dur
        gap = nxt - t
        if gap < 1.6 or t < 0.3:
            continue
        z = 1.18 if dev == "duo" else 1.3 if kind == "phone" else 1.7
        out.append([round(t + 0.1, 3), round(x), round(y), z, round(min(2.4, gap - 1.2), 2)])
    return out


# ---- Project
shutil.rmtree(proj, ignore_errors=True)
shutil.copytree(preset / "template", proj)
(proj / "assets/rec").mkdir(parents=True, exist_ok=True)
(proj / "assets/sfx").mkdir(parents=True, exist_ok=True)
for f in (vdir / "rec").glob("*.mp4"):
    shutil.copy(f, proj / "assets/rec" / f.name)
for f in (SKILL / "presets/tiktok-explainer/assets/sfx").glob("*.wav"):
    shutil.copy(f, proj / "assets/sfx" / f.name)
mark = ""
if B.get("logo"):
    src = vdir / safe(B["logo"], "brand logo")
    if not src.exists():
        sys.exit(f"brand logo {B['logo']!r} not found in {vdir}")
    shutil.copy(src, proj / "assets" / ("logo" + src.suffix))
    mark = f'<div id="end-mark"><img src="assets/logo{src.suffix}" alt="" /></div>'

comp = proj / "compositions"
step_tpl = (comp / "step.html").read_text()
(comp / "step.html").unlink()
product, tagline, cta = brief.get("product", name), brief.get("tagline", ""), brief.get("cta", "")
hook = brief.get("hook", [])
hook_text = " / ".join(hook)
fill = {"HOOK_HTML": words(hook_text, "hook-last"), "HOOK_SIZE": fit(max(hook, key=len) if hook else "x", 150, 900),
        "NAME": esc(product), "NAME_SIZE": fit(product, 230), "END_SIZE": fit(product, 168), "TAGLINE": esc(tagline),
        "CTA": esc(cta), "MARK": mark}
for f in ("hook.html", "name.html", "end.html"):
    s = (comp / f).read_text()
    for k, v in fill.items():
        s = s.replace("{{" + k + "}}", str(v))
    (comp / f).write_text(s)

scenes, sfx, t = [], [], 0.0
if hook:
    scenes.append(("hook", 0.0, 2.4)); sfx.append(("whoosh", 2.2)); t = 2.4
scenes.append(("name", t, 1.8)); sfx.append(("whoosh", t + 1.6)); t += 1.8
prev_dev = None
steps = brief["steps"]
for i, st in enumerate(steps):
    sid = f"step{i + 1}"
    body, taps, points, dur, dev, conv = frames(st, sid)
    top = min(int(m) for m in re.findall(r'class="s-(?:phone|win)" style="left:\d+px;top:(\d+)px', body))
    data = {"id": sid, "taps": taps, "punches": punches(st, points, dur, dev, conv), "rise": dev != prev_dev, "dur": round(dur, 3), "last": False, "top": top}
    s = (step_tpl.replace("{{ID}}", sid).replace("{{CAPTION}}", words(st["caption"])).replace("{{FRAMES}}", body)
         .replace("/*DATA*/{}", json.dumps(data)))
    (comp / f"{sid}.html").write_text(s)
    scenes.append((sid, t, dur))
    if dev != prev_dev and prev_dev:
        sfx.append(("whoosh", t - 0.15))
    for k, (_, tt) in enumerate(taps):
        sfx.append(("tick" if k % 2 == 0 else "pop", t + tt - 0.03))
    prev_dev = dev
    t += dur
scenes.append(("end", t, 3.4)); sfx.append(("reveal", t + 0.05))
total = round(t + 3.4, 3)

music = brief.get("music", "sunny")
audio = ""
if music != "none":
    track = SKILL / "assets/music" / f"{music}.mp3"
    if not track.exists():
        sys.exit(f"music {music!r} not found in assets/music")
    shutil.copy(track, proj / "assets/music.mp3")
    audio += f'      <audio id="music" src="assets/music.mp3" data-start="0" data-duration="{total}" data-track-index="2" data-volume="0.55" data-fade-out="1.5"></audio>\n'
for i, (snd, at) in enumerate(sfx):
    d = {"whoosh": 0.6, "tick": 0.06, "pop": 0.18, "reveal": 0.6}[snd]
    audio += f'      <audio id="sfx{i}" src="assets/sfx/{snd}.wav" data-start="{max(0, at):.3f}" data-duration="{d}" data-track-index="3" data-volume="0.8"></audio>\n'
hosts = "\n".join(
    f'      <div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{st:.3f}" '
    f'data-duration="{d:.3f}" data-track-index="1" data-track-kind="graphics" data-width="1080" data-height="1920"></div>'
    for sid, st, d in scenes)
page = (proj / "index.html").read_text()
for k, v in {"CSS": css, "DURATION": total, "SCENES": hosts, "AUDIO": audio, "LANG": brief.get("language", "en")}.items():
    page = page.replace("{{" + k + "}}", str(v))
(proj / "index.html").write_text(page)

# SPEC.md: the brief as numbers, for whoever opens the project in HyperFrames Studio.
spec = [f"GOAL:    a viewer sees {product} do {len(steps)} real tasks and knows where to get it ({cta}).",
        f"OUTPUT:  HyperFrames, 1080 x 1920, 30 fps; {total} s; preset {preset.name}",
        f"LOOK:    ground {bg}, ink {ink}, accent {accent} (one word per caption, the hook's last word, the CTA); {font} 900",
        "MOTION:  arrivals expo.out 0.5-0.7 s; camera power2.inOut 0.5 s; captions blur 6px->0, 0.067 s apart, dead still after landing",
        "SHOTS:"] + [f"  {sid} {st:.1f}-{st + d:.1f}" for sid, st, d in scenes] + [
        "BANNED:  invented UI; glow, grain, particles; breathing loops; fade-and-slide-up; text outside 168-1330 px; a repeated claim"]
(proj / "SPEC.md").write_text("\n".join(spec) + "\n")
print(f"preset {preset}\n{len(steps)} steps, {len(sfx)} sounds, {total}s -> {proj}")


def run(*cmd, **kw):
    return subprocess.run(cmd, cwd=proj, **kw)


chk = run("npx", "--yes", HF, "check", capture_output=True, text=True)
print("\n".join(l for l in chk.stdout.splitlines() if "✗" in l or "Check" in l))
if chk.returncode:
    sys.exit("hyperframes check failed; see above")
at = ",".join(f"{st + min(d * 0.6, d - 0.2):.2f}" for sid, st, d in scenes)
snap = run("npx", "--yes", HF, "snapshot", "--at", at, capture_output=True, text=True)
m = re.search(r"(\S*contact-sheet[^\s]*\.jpg)", snap.stdout)
if m:
    (proj / "check").mkdir(exist_ok=True)
    shutil.copy(proj / m.group(1) if not m.group(1).startswith("/") else m.group(1), proj / "check/sheet.jpg")
    print(f"snapshots: {proj / 'check/sheet.jpg'}")
if not render:
    sys.exit(0)

out = Path("output") / name / preset.name
out.mkdir(parents=True, exist_ok=True)
raw, final = proj / "render.mp4", out / f"{name}.mp4"
tmp = proj / ".render-tmp"
tmp.mkdir(exist_ok=True)
run("npx", "--yes", HF, "render", "--crf", "18", "-o", str(raw.resolve()), check=True, env={**os.environ, "TMPDIR": str(tmp)})
shutil.rmtree(tmp, ignore_errors=True)


def loud(f):
    r = subprocess.run(["ffmpeg", "-i", str(f), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    i = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", r)[-1])
    p = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", r)[-1])
    return i, p


# Gain to -14 LUFS, then a limiter for the true peak; one correction pass if the limiter cost loudness.
gain = -14 - loud(raw)[0]
for _ in range(2):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-c:v", "copy", "-af",
                    f"volume={gain:.2f}dB,alimiter=limit=0.6:level=false:attack=1:release=60", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", str(final)], check=True)
    i, p = loud(final)
    if abs(i + 14) <= 0.6:
        break
    gain += -14 - i
print(f"loudness {i} LUFS, true peak {p} dBTP")
credits = [f.read_text().strip() for f in (vdir / "CREDITS.txt", preset / "CREDITS.txt") if f.exists()]
if music != "none":
    m2 = re.search(rf"^- {re.escape(music)}\.mp3: (.+)$", (SKILL / "assets/CREDITS.txt").read_text(), re.M)
    credits.append("Music: " + (m2.group(1) if m2 else music))
(out / "CREDITS.txt").write_text("\n\n".join(credits) + "\n")
print(f"rendered {final}")

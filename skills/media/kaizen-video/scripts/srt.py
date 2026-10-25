"""Write an .srt from film.json + words.json using the same timeline as the engine.
Usage: python3 scripts/srt.py <film-dir> <out.srt>"""
import json, sys
folder, out = sys.argv[1], sys.argv[2]
film = json.load(open(f"{folder}/film.json")); words = json.load(open(f"{folder}/words.json"))
import os
ENGINE = os.path.expanduser(os.environ.get("STORY_VIDEO_ENGINE", "~/.kaizen/story-video/engine"))
p = json.load(open(f"{ENGINE}/src/engine/presets.json"))[film["preset"]]
FPS = 30
def blen(b):
    v = (p["pace"]["lead"] + words[b["vo"]]["dur"] + p["pace"]["tail"]) if b.get("vo") else 0
    return round((v + b.get("hold", 0)) * FPS)
def ts(sec):
    ms = int(round(sec * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"
start, cues = 0, []
for b in film["beats"]:
    if b.get("vo"):
        ws = words[b["vo"]]["words"]; t0 = start / FPS + p["pace"]["lead"]
        chunk = []
        for w in ws:
            chunk.append(w)
            if len(chunk) >= 7 or w["w"][-1] in ".,?!" or w is ws[-1]:
                cues.append([t0 + chunk[0]['s'], t0 + chunk[-1]['e'] + 0.2, ' '.join(x['w'] for x in chunk)])
                chunk = []
    start += blen(b)
for a_, b_ in zip(cues, cues[1:]):
    a_[1] = min(a_[1], b_[0] - 0.02)  # no overlapping cues
lines = [f"{i}\n{ts(s)} --> {ts(e)}\n{t}\n" for i, (s, e, t) in enumerate(cues, 1)]
open(out, "w").write("\n".join(lines)); print("srt", len(cues), "cues")

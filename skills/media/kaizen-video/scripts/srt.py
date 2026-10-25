"""Write an .srt from the cues make_film.py computed (<film-dir>/film/cues.json: [[start, end, text], ...]).
Usage: python3 scripts/srt.py <film-dir> <out.srt>"""
import json, sys
cues = json.load(open(f"{sys.argv[1]}/film/cues.json"))
def ts(sec):
    ms = int(round(sec * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"
open(sys.argv[2], "w").write("\n".join(f"{i}\n{ts(s)} --> {ts(e)}\n{t}\n" for i, (s, e, t) in enumerate(cues, 1)))
print("srt", len(cues), "cues")

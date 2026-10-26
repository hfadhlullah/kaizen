# Two sample meetings spoken by two synthetic voices, for filming Notula. Writes audio + segments json.
import asyncio, json, subprocess, edge_tts
V = {"A": "en-US-AndrewNeural", "B": "en-US-AvaNeural"}
MEET = {
 "standup": ("Product sync: onboarding", [
  ("A", "Quick check on onboarding. Sign-ups are fine, but people drop off before their first recording."),
  ("B", "Right. The microphone permission screen confuses them. I'd move it after the welcome tour."),
  ("A", "Agreed. Can you ship that this week?"),
  ("B", "Yes, by Thursday. I'll also add a sample recording so the list is never empty."),
  ("A", "Great. Last thing, summaries in Indonesian. Let's test those with three customers."),
  ("B", "I'll book the calls and share notes on Friday."),
 ]),
 "interview": ("Customer interview: Rina", [
  ("B", "How do you take notes in meetings today?"),
  ("A", "I type while people talk, so I miss half of it. Then I rewrite everything after."),
  ("B", "What would help most?"),
  ("A", "Just the decisions and who does what. I don't need every word."),
 ]),
}
async def main():
    out = {}
    for key, (title, lines) in MEET.items():
        parts, segs, t = [], [], 0.0
        for i, (spk, text) in enumerate(lines):
            f = f"{key}-{i}.mp3"
            await edge_tts.Communicate(text, V[spk]).save(f)
            d = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]))
            segs.append({"speaker": f"Speaker {1 if spk == 'A' else 2}", "start": round(t, 2), "text": text})
            parts.append(f); t += d + 0.35
        with open(f"{key}.txt", "w") as o:
            for p in parts: o.write(f"file '{p}'\nfile 'gap.mp3'\n")
        out[key] = {"title": title, "segments": segs, "seconds": round(t)}
    json.dump(out, open("meetings.json", "w"), indent=1)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.35", "-c:a", "libmp3lame", "gap.mp3"], check=True)
asyncio.run(main())
for k in ("standup", "interview"):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", f"{k}.txt", "-ar", "44100", "-c:a", "aac", f"{k}.m4a"], check=True)
print(open("meetings.json").read()[:300])

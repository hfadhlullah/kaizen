"""Build the sound-effect / room-tone library into the shared engine (~/.kaizen/story-video/engine/sfx/).
Usage: python3 scripts/sfx.py [--provider synth|elevenlabs] [--force]
  synth       (default without ELEVENLABS_API_KEY) — synthesized locally with ffmpeg; free, no licence limits.
  elevenlabs  (default with a key) — generated sound effects; commercial use needs a paid ElevenLabs plan.
Only missing files are made unless --force. Names are what presets.json and beats (sfx/ambience) use.
No sound files ship with the skill: every machine makes its own."""
import json, os, subprocess, sys, urllib.request

LIB = {
    "whoosh": ("soft airy cinematic whoosh transition, short, clean", 1.2),
    "hit": ("deep warm cinematic impact boom with soft tail, for a logo reveal", 2.5),
    "riser": ("gentle airy riser building tension, soft, ends cleanly", 2.5),
    "tick": ("very soft subtle UI tick, minimal click", 0.5),
    "pop": ("playful bubbly pop sound, bright, short", 0.5),
    "chime": ("bright happy chime sparkle for a reveal", 1.8),
    "ping": ("single smartphone chat message notification ping", 0.8),
    "pings": ("many chat message notification pings stacking up quickly, overwhelming", 3.0),
    "bell": ("school bell ringing in the distance, Indonesian school morning", 3.0),
    "keyboard": ("typing on a laptop keyboard in a quiet office", 4.0),
    "amb-morning": ("quiet morning outdoor ambience with birds and distant children near a school gate", 10.0),
    "amb-classroom": ("soft classroom room tone with murmuring students and pencil sounds", 10.0),
    "amb-office": ("quiet office room tone, air conditioner hum, occasional paper rustle", 10.0),
    "amb-night": ("quiet night ambience indoors at home, crickets outside", 10.0),
}
# ffmpeg recipes for the free synthesized library (lavfi sources + filters)
SYNTH = {
    "whoosh": "anoisesrc=d=1.2:c=pink:a=0.6,highpass=f=300,lowpass=f=5000,afade=t=in:d=0.5,afade=t=out:st=0.6:d=0.6",
    "hit": "sine=f=55:d=2.5,volume=1.5,afade=t=out:st=0.05:d=2.4,lowpass=f=200",
    "riser": "anoisesrc=d=2.5:c=pink:a=0.5,highpass=f=200,afade=t=in:d=2.3,afade=t=out:st=2.35:d=0.15",
    "tick": "sine=f=1800:d=0.05,afade=t=out:d=0.05,volume=0.6",
    "pop": "sine=f=620:d=0.12,afade=t=out:d=0.12,volume=0.9",
    "chime": "sine=f=1318:d=1.8,afade=t=out:d=1.8,volume=0.5",
    "ping": "sine=f=1046:d=0.4,afade=t=out:d=0.4,volume=0.7",
    "pings": "sine=f=1046:d=0.18,afade=t=out:d=0.18,apad=pad_dur=0.12,aloop=loop=9:size=13230,volume=0.6",
    "bell": "sine=f=880:d=3,afade=t=out:d=3,volume=0.5",
    "keyboard": "anoisesrc=d=4:c=white:a=0.3,highpass=f=2000,volume=0.4,apulsator=hz=9:amount=1",
    "amb-morning": "anoisesrc=d=10:c=brown:a=0.15,lowpass=f=800,afade=t=in:d=1,afade=t=out:st=9:d=1",
    "amb-classroom": "anoisesrc=d=10:c=pink:a=0.08,lowpass=f=1200,afade=t=in:d=1,afade=t=out:st=9:d=1",
    "amb-office": "anoisesrc=d=10:c=brown:a=0.12,lowpass=f=400,afade=t=in:d=1,afade=t=out:st=9:d=1",
    "amb-night": "anoisesrc=d=10:c=brown:a=0.08,lowpass=f=300,afade=t=in:d=1,afade=t=out:st=9:d=1",
}

args = sys.argv[1:]
force = "--force" in args
provider = args[args.index("--provider") + 1] if "--provider" in args else ("elevenlabs" if os.environ.get("ELEVENLABS_API_KEY") else "synth")
SFX = os.path.expanduser(os.environ.get("STORY_VIDEO_ENGINE", "~/.kaizen/story-video/engine")) + "/sfx"
os.makedirs(SFX, exist_ok=True)
H = {"xi-api-key": os.environ.get("ELEVENLABS_API_KEY", ""), "Content-Type": "application/json"}
print("sfx provider:", provider)
for name, (prompt, sec) in LIB.items():
    path = f"{SFX}/{name}.mp3"
    if os.path.exists(path) and not force:
        continue
    if provider == "elevenlabs":
        req = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation",
                                     data=json.dumps({"text": prompt, "duration_seconds": sec, "prompt_influence": 0.5}).encode(), headers=H)
        open(path + ".raw", "wb").write(urllib.request.urlopen(req).read())
        src = ["-i", path + ".raw"]
    else:
        src = ["-f", "lavfi", "-i", SYNTH[name]]
    subprocess.run(["ffmpeg", "-v", "error", "-y", *src, "-af", "loudnorm=I=-18:TP=-2", "-ar", "44100", "-ac", "2", path], check=True)
    if os.path.exists(path + ".raw"):
        os.remove(path + ".raw")
    print("made", name)

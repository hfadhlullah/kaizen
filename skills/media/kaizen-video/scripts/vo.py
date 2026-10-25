"""Voice-over with word timings (ElevenLabs eleven_v3, with-timestamps).
Usage: python3 scripts/vo.py <film-dir> [voice_id] [only,keys]
Reads <film-dir>/lines.json {"v01": "[softly] Text...", ...}; writes vNN.mp3 + words.json.
Emotion tags in [brackets] direct the delivery and are removed from the captions.
Voice and language come from film.json ("voice", "language"); defaults: Matilda, "id"."""
import base64, json, os, re, subprocess, sys, urllib.request

film_dir = sys.argv[1].rstrip("/")
out = film_dir + "/"
film = json.load(open(out + "film.json")) if os.path.exists(out + "film.json") else {}
voice = (sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None) or film.get("voice") or "XrExE9yKIg1WjnnlVkGX"
lang = film.get("language", "id")
H = {"xi-api-key": os.environ.get("ELEVENLABS_API_KEY", ""), "Content-Type": "application/json"}
lines = json.load(open(out + "lines.json"))
prev = json.load(open(out + "words.json")) if os.path.exists(out + "words.json") else {}
only = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None  # regenerate only these keys


def words_from(alignment):
    chars, starts, ends = alignment["characters"], alignment["character_start_times_seconds"], alignment["character_end_times_seconds"]
    words, cur, s, e, depth = [], "", None, None, 0
    for ch, cs, ce in zip(chars, starts, ends):
        if ch == "[": depth += 1; continue
        if ch == "]": depth -= 1; continue
        if depth: continue
        if ch.isspace():
            if cur.strip(): words.append({"w": cur.strip(), "s": s, "e": e})
            cur, s = "", None
            continue
        if s is None: s = cs
        cur += ch; e = ce
    if cur.strip(): words.append({"w": cur.strip(), "s": s, "e": e})
    return [w for w in words if re.search(r"\w", w["w"])]


EDGE_DEFAULT = {"id": "id-ID-GadisNeural", "en": "en-US-AriaNeural", "ms": "ms-MY-YasminNeural"}


def edge_line(key, text):
    """Free fallback (Microsoft Edge neural voices via edge-tts, `pip install edge-tts`). No emotion
    control: tags are removed. Word timings come from the WordBoundary events."""
    import asyncio, edge_tts
    clean = re.sub(r"\[[^\]]*\]\s*", "", text)
    v = film.get("edgeVoice") or EDGE_DEFAULT.get(lang, "en-US-AriaNeural")
    words, audio = [], bytearray()
    async def run():
        async for ch in edge_tts.Communicate(clean, v, rate="-5%", boundary="WordBoundary").stream():
            if ch["type"] == "audio": audio.extend(ch["data"])
            elif ch["type"] == "WordBoundary":
                st = ch["offset"] / 1e7; words.append({"w": ch["text"], "s": st, "e": st + ch["duration"] / 1e7})
    asyncio.run(run())
    return bytes(audio), words, clean


provider = film.get("voiceProvider") or ("elevenlabs" if os.environ.get("ELEVENLABS_API_KEY") else "edge")
print("voice provider:", provider)
result = dict(prev)
for key, text in lines.items():
    if only and key not in only:
        continue
    if provider == "edge":
        audio, ws, clean = edge_line(key, text)
        raw = out + key + ".raw.mp3"; open(raw, "wb").write(audio)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "44100", out + key + ".mp3"], check=True)
        os.remove(raw)
        ws = [w for w in ws if re.search(r"\w", w["w"])]
        # edge-tts drops punctuation; take each word's spelling from the script so captions keep it
        toks = clean.split(); ti = 0
        for w in ws:
            core = re.sub(r"\W", "", w["w"]).lower()
            for j in range(ti, min(ti + 4, len(toks))):
                if re.sub(r"\W", "", toks[j]).lower() == core:
                    w["w"] = toks[j]; ti = j + 1; break
        offset = max(0.0, ws[0]["s"] - 0.05)
        for w in ws:
            w["s"] = round(w["s"] - offset, 3); w["e"] = round(w["e"] - offset, 3)
        result[key] = {"dur": round(ws[-1]["e"] + 0.15, 3), "offset": round(offset, 3), "text": clean, "words": ws}
        print(key, result[key]["dur"], "s")
        json.dump(result, open(out + "words.json", "w"), ensure_ascii=False, indent=1); continue
    body = {"text": text, "model_id": "eleven_v3", "language_code": lang, "voice_settings": {"stability": film.get("stability", 0.0)}}
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps",
                                 data=json.dumps(body).encode(), headers=H)
    try:
        d = json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        sys.exit(f"{key}: ElevenLabs refused ({e.code}): {e.read()[:300].decode(errors='ignore')} — lines before {key} are saved.")
    raw = out + key + ".raw.mp3"
    open(raw, "wb").write(base64.b64decode(d["audio_base64"]))
    # loudness only — never trim, so the timings stay valid
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "44100", out + key + ".mp3"], check=True)
    os.remove(raw)
    ws = words_from(d["alignment"])
    offset = max(0.0, ws[0]["s"] - 0.05)
    for w in ws:
        w["s"] = round(w["s"] - offset, 3); w["e"] = round(w["e"] - offset, 3)
    clean = re.sub(r"\[[^\]]*\]\s*", "", text)
    result[key] = {"dur": round(ws[-1]["e"] + 0.15, 3), "offset": round(offset, 3), "text": clean, "words": ws}
    print(key, result[key]["dur"], "s")
    json.dump(result, open(out + "words.json", "w"), ensure_ascii=False, indent=1)  # after every line: a failure never leaves audio and timings out of step

"""Turn whatever the user brought into film-ready assets.
Usage: python3 scripts/intake.py <film-dir> [input_dir]   (default input_dir: <film-dir>/inputs)
<input_dir> may contain, in any mix:
  photos/      story photos            -> <name>-16x9.jpg + <name>-9x16.jpg (cropped, light grade)
  screens/     app/web screenshots     -> copied untouched; ratio recorded (use kind "shot")
  footage/     video clips (.mp4/.mov) -> <name>.mp4 (H.264, no audio, 1080p max)
  logo*.png    logo(s)                  -> copied; dominant colours suggested for brand.palette
  *.pptx/*.pdf deck                     -> slide images in <film-dir>/intake/slides/, text in intake/deck.md
  brief.md     the user's story/prompt -> copied to <film-dir>/intake/ (read it when writing the treatment)
Writes <film-dir>/intake.json (asset list) and prints a summary."""
import json, os, shutil, subprocess, sys
from pathlib import Path
from PIL import Image, ImageEnhance

out = Path(sys.argv[1]); src = Path(sys.argv[2]) if len(sys.argv) > 2 else out / "inputs"
out.mkdir(parents=True, exist_ok=True)
work = out / "intake"; work.mkdir(parents=True, exist_ok=True)
manifest = {"photos": [], "screens": [], "footage": [], "logos": [], "slides": [], "palette_suggestion": []}
IMG = {".jpg", ".jpeg", ".png", ".webp"}


def crop(im, w, h, fy=0.5):
    r = w / h
    if im.width / im.height > r:
        nw = int(im.height * r); x = (im.width - nw) // 2; im = im.crop((x, 0, x + nw, im.height))
    else:
        nh = int(im.width / r); y = int((im.height - nh) * fy); im = im.crop((0, y, im.width, y + nh))
    return im.resize((w, h), Image.LANCZOS)


def grade(im):
    im = ImageEnhance.Color(im).enhance(0.85)
    return Image.blend(im, Image.new("RGB", im.size, (60, 40, 20)), 0.06)


for f in sorted((src / "photos").glob("*")) if (src / "photos").exists() else []:
    if f.suffix.lower() not in IMG: continue
    im = Image.open(f).convert("RGB")
    for tag, size in (("16x9", (1920, 1080)), ("9x16", (1080, 1920))):
        grade(crop(im, *size)).save(out / f"{f.stem}-{tag}.jpg", quality=88)
    manifest["photos"].append(f.stem)
for f in sorted((src / "screens").glob("*")) if (src / "screens").exists() else []:
    if f.suffix.lower() not in IMG: continue
    im = Image.open(f); shutil.copy(f, out / f.name)
    manifest["screens"].append({"file": f.name, "ratio": round(im.width / im.height, 3)})
for f in sorted((src / "footage").glob("*")) if (src / "footage").exists() else []:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-an", "-vf", "scale='min(1920,iw)':-2", "-c:v", "libx264", "-crf", "20", str(out / (f.stem + ".mp4"))], check=True)
    manifest["footage"].append(f.stem + ".mp4")
for f in sorted(src.glob("logo*")):
    shutil.copy(f, out / f.name); manifest["logos"].append(f.name)
    im = Image.open(f).convert("RGBA"); im.thumbnail((200, 200))
    px = [p[:3] for p in (im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata()) if p[3] > 200 and not (max(p[:3]) > 235 and min(p[:3]) > 235) and max(p[:3]) > 30]
    if px:
        q = Image.new("RGB", (len(px), 1)); q.putdata(px)
        cols = q.quantize(colors=4).convert("RGB").getcolors(4) or []
        manifest["palette_suggestion"] += ["#%02X%02X%02X" % c for _, c in sorted(cols, reverse=True)]
for f in list(src.glob("*.pptx")) + list(src.glob("*.pdf")):
    pdf = f
    if f.suffix == ".pptx":
        subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(work), str(f)], check=True, capture_output=True)
        pdf = work / (f.stem + ".pdf")
        subprocess.run(f"markitdown '{f}' > '{work}/deck.md'", shell=True)
    else:
        subprocess.run(["pdftotext", "-layout", str(f), str(work / "deck.md")])
    (work / "slides").mkdir(exist_ok=True)
    subprocess.run(["pdftoppm", "-jpeg", "-r", "80", str(pdf), str(work / "slides" / "s")], check=True)
    manifest["slides"] = sorted(p.name for p in (work / "slides").glob("*.jpg"))
if (src / "brief.md").exists():
    shutil.copy(src / "brief.md", work / "brief.md")
json.dump(manifest, open(out / "intake.json", "w"), indent=1)
print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in manifest.items()}))
print("palette suggestion:", manifest["palette_suggestion"][:4])
print("read:", work)

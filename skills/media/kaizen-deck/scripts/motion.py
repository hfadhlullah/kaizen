#!/usr/bin/env python3
"""Add slide transitions, entrance fades and video autoplay to a built .pptx.

Usage: python3 motion.py in.pptx out.pptx

Shapes appear on their own, with no clicks. Name shapes `a<N>-anything`
(objectName in pptxgenjs) to control the order: the same N fades in together.
A slide with no such names fades its shapes in one after another.
Embedded videos play on slide entry, muted and looping.
"""
import re
import struct
import sys
import zipfile

TRANSITIONS = ['<p:transition spd="med"><p:fade/></p:transition>',
               '<p:transition spd="med"><p:push dir="l"/></p:transition>']
STAGGER_MS = 350
FADE_MS = 600


def mp4_ms(data):
    """Duration from the mp4 mvhd box."""
    i = data.find(b"mvhd")
    if i < 0:
        return 60000
    if data[i + 4] == 1:
        scale, length = struct.unpack(">IQ", data[i + 24:i + 36])
    else:
        scale, length = struct.unpack(">II", data[i + 16:i + 24])
    return max(1, length * 1000 // scale)


def fade(ids, sid, group):
    target = f'<p:tgtEl><p:spTgt spid="{sid}"/></p:tgtEl>'
    return (f'<p:par><p:cTn id="{next(ids)}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="withEffect">'
            f'<p:stCondLst><p:cond delay="{200 + group * STAGGER_MS}"/></p:stCondLst><p:childTnLst>'
            f'<p:set><p:cBhvr><p:cTn id="{next(ids)}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>{target}'
            '<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>'
            f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{next(ids)}" dur="{FADE_MS}"/>{target}</p:cBhvr></p:animEffect>'
            '</p:childTnLst></p:cTn></p:par>')


def play(ids, sid, ms):
    return (f'<p:par><p:cTn id="{next(ids)}" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="withEffect">'
            '<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr>'
            f'<p:cTn id="{next(ids)}" dur="{ms}" fill="hold"/><p:tgtEl><p:spTgt spid="{sid}"/></p:tgtEl></p:cBhvr></p:cmd>'
            '</p:childTnLst></p:cTn></p:par>')


def timing(xml, video_ms):
    ids = iter(range(4, 100000))
    named = [(sid, int(g)) for sid, g in re.findall(r'<p:cNvPr id="(\d+)" name="a(\d+)-', xml)]
    if not named:
        found = re.findall(r'<p:(?:sp|pic)>.*?<p:cNvPr id="(\d+)"', xml, re.S)
        named = [(sid, n) for n, sid in enumerate(found)]
    video = next((re.search(r'<p:cNvPr id="(\d+)"', pic)[1]
                  for pic in re.findall(r"<p:pic>.*?</p:pic>", xml, re.S) if "videoFile" in pic), None)
    if not named and not video:
        return ""
    inner = next(ids)
    effects = "".join(fade(ids, sid, group) for sid, group in named)
    media = ""
    if video and video_ms:
        effects += play(ids, video, video_ms)
        media = (f'<p:video><p:cMediaNode vol="0"><p:cTn id="{next(ids)}" repeatCount="indefinite" fill="hold" display="0">'
                 f'<p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{video}"/></p:tgtEl>'
                 '</p:cMediaNode></p:video>')
    slide = '<p:tgtEl><p:sldTgt/></p:tgtEl>'
    return ('<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
            '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
            '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>'
            f'<p:par><p:cTn id="{inner}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>{effects}</p:childTnLst></p:cTn></p:par>'
            '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn>'
            f'<p:prevCondLst><p:cond evt="onPrev" delay="0">{slide}</p:cond></p:prevCondLst>'
            f'<p:nextCondLst><p:cond evt="onNext" delay="0">{slide}</p:cond></p:nextCondLst></p:seq>'
            f'{media}</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>')


def main(src, dst):
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item)
            m = re.fullmatch(r"ppt/slides/slide(\d+)\.xml", item.filename)
            if m:
                rels = zin.read(f"ppt/slides/_rels/slide{m[1]}.xml.rels").decode()
                # ponytail: one video per slide; a second one stays click-to-play
                mp4 = re.search(r"media/([^\"]+\.mp4)", rels)
                ms = mp4_ms(zin.read("ppt/media/" + mp4[1])) if mp4 else 0
                xml = data.decode()
                add = TRANSITIONS[int(m[1]) % 2] + timing(xml, ms)
                data = xml.replace("</p:clrMapOvr>", "</p:clrMapOvr>" + add, 1).encode()
            zout.writestr(item, data)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

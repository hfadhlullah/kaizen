#!/usr/bin/env python3
"""Make the billboard materials alpha-tested (MASK) in a .glb: usage cutout.py in.glb out.glb
Blender exports leaf cards as BLEND, which sorts badly in three.js; MASK needs no sorting."""
import json, struct, sys
b = open(sys.argv[1], "rb").read()
n = struct.unpack("<I", b[12:16])[0]
j = json.loads(b[20:20 + n])
for m in j.get("materials", []):
    if m.get("alphaMode") == "BLEND":
        m["alphaMode"] = "MASK"; m["alphaCutoff"] = 0.5; m["doubleSided"] = True
t = json.dumps(j, separators=(",", ":")).encode(); t += b" " * (-len(t) % 4)
rest = b[20 + n:]
open(sys.argv[2], "wb").write(b[:8] + struct.pack("<I", 12 + 8 + len(t) + len(rest)) + struct.pack("<I", len(t)) + b"JSON" + t + rest)

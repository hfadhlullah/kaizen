#!/usr/bin/env python3
"""Drops root nodes whose names start with the given prefixes from a .glb (the meshes they used go at the next `gltf-transform optimize`):
   trim.py in.glb out.glb D_flame D_bracket
For rebuilding a scene's file without Blender when only a few separate objects must go."""
import json, struct, sys
src, dst, prefixes = sys.argv[1], sys.argv[2], tuple(sys.argv[3:])
b = open(src, "rb").read()
n = struct.unpack("<I", b[12:16])[0]
j = json.loads(b[20:20 + n])
names = {i: nd.get("name", "") for i, nd in enumerate(j["nodes"])}
drop = {i for i, nm in names.items() if nm.startswith(prefixes)}
for sc in j["scenes"]: sc["nodes"] = [i for i in sc["nodes"] if i not in drop]
for nd in j["nodes"]:
    if "children" in nd: nd["children"] = [c for c in nd["children"] if c not in drop]
t = json.dumps(j, separators=(",", ":")).encode(); t += b" " * (-len(t) % 4)
rest = b[20 + n:]
open(dst, "wb").write(b[:8] + struct.pack("<I", 12 + 8 + len(t) + len(rest)) + struct.pack("<I", len(t)) + b"JSON" + t + rest)
print("dropped", len(drop), "nodes:", sorted(names[i] for i in drop))

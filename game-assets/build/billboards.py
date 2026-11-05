# Renders each full-detail tree to transparent PNGs from two sides (0 and 90 degrees), for crossed-card
# billboards. Run inside Blender with the Poly Haven tree models imported at full detail.
import bpy, math, os
from mathutils import Vector
OUT = os.path.expanduser("~/.cache/kaizen-game/bb"); os.makedirs(OUT, exist_ok=True)
TREES = ["fir_sapling_medium_a_LOD0", "fir_sapling_medium_b_LOD0", "fir_sapling_medium_c_LOD0", "tree_small_02_LOD0"]
sc = bpy.context.scene
sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
cam = bpy.data.objects.get("PrevCam") or bpy.data.objects.new("PrevCam", bpy.data.cameras.new("PrevCam"))
if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
sc.camera = cam; cam.data.type = "ORTHO"
trees = [bpy.data.objects[n] for n in TREES]
info = {}
for t in trees:
    for o in trees: o.hide_render = o is not t
    bb = [t.matrix_world @ Vector(c) for c in t.bound_box]
    lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    ctr = (lo + hi) / 2; w = max(hi.x - lo.x, hi.y - lo.y); h = hi.z - lo.z
    side = max(w, h * 0.55) * 1.04                       # card width in metres (ortho scale follows the longer side)
    sc.render.resolution_x = 512; sc.render.resolution_y = int(512 * (h * 1.04) / side)
    cam.data.ortho_scale = h * 1.04 if sc.render.resolution_y > 512 else side   # ortho scale covers the longer image side
    for ang in (0, 90):
        a = math.radians(ang); d = Vector((math.sin(a), -math.cos(a), 0)) * (max(w, h) * 3)
        cam.location = Vector((ctr.x, ctr.y, ctr.z)) + d; cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = f"{OUT}/{t.name}_{ang}.png"; bpy.ops.render.render(write_still=True)
    info[t.name] = (round(side, 2), round(h, 2), round(ctr.z - lo.z, 2))
for o in trees: o.hide_render = False
print(info)

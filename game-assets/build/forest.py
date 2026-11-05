# Forest scene assembly. Run inside Blender after: the Poly Haven assets in game-assets/LICENSES.md are imported
# and billboards.py has rendered the tree cards to ~/.cache/kaizen-game/bb. Trees are crossed billboard cards
# (full-detail scans are 0.2-5 M polygons); logs and stumps are real meshes, decimated. Trail runs along +X.
import bpy, random, math, os
random.seed(7)
BB = os.path.expanduser("~/.cache/kaizen-game/bb")
sc = bpy.context.scene
for o in list(bpy.data.objects):
    if o.name.startswith(("F_", "Ground")): bpy.data.objects.remove(o, do_unlink=True)
col = bpy.data.collections.get("Forest") or bpy.data.collections.new("Forest")
if col.name not in sc.collection.children: sc.collection.children.link(col)

def card_mesh(name, w, h):                       # two crossed quads, base on the ground
    me = bpy.data.meshes.new(name); hw = w / 2
    v = [(-hw, 0, 0), (hw, 0, 0), (hw, 0, h), (-hw, 0, h), (0, -hw, 0), (0, hw, 0), (0, hw, h), (0, -hw, h)]
    me.from_pydata(v, [], [(0, 1, 2, 3), (4, 5, 6, 7)])
    uv = me.uv_layers.new(name="UVMap")
    for i, (u, vv) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)] * 2): uv.data[i].uv = (u, vv)
    return me

def card_mat(name, a, b=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = bpy.data.images.load(f"{BB}/{a}", check_existing=True)
    tx.extension = "CLIP"
    nt.links.new(tx.outputs["Color"], bs.inputs["Base Color"]); nt.links.new(tx.outputs["Alpha"], bs.inputs["Alpha"])
    bs.inputs["Roughness"].default_value = 1.0
    nt.links.new(bs.outputs["BSDF"], out.inputs["Surface"])
    try: m.surface_render_method = "DITHERED"
    except Exception: pass
    m["kz_cutout"] = 1
    return m

# name, card width, height, base offset (from billboards.py output)
T = {"fir_a": ("fir_sapling_medium_a_LOD0", 5.49, 8.83), "fir_b": ("fir_sapling_medium_b_LOD0", 4.46, 7.8),
     "fir_c": ("fir_sapling_medium_c_LOD0", 4.48, 5.91), "bro": ("tree_small_02_LOD0", 4.46, 4.56)}
mesh = {}
for k, (src, w, h) in T.items():
    me = card_mesh("card_" + k, w, h)
    me.materials.append(card_mat("card_" + k, src + "_0.png")); mesh[k] = me
    # the second plane (90 degrees) needs the other render: give it its own material slot
    m2 = card_mat("card_" + k + "_90", src + "_90.png"); me.materials.append(m2)
    for i, p in enumerate(me.polygons): p.material_index = i

# heavy source scans leave the scene; logs and stumps keep a decimated mesh
for n in [o.name for o in bpy.data.objects if o.name.endswith("_LOD0")]: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
budget = {"dead_tree_trunk": 4000, "tree_stump_01": 3000}
dg = bpy.context.evaluated_depsgraph_get()
for n, b in budget.items():
    o = bpy.data.objects[n]; cnt = len(o.data.polygons)
    if cnt > b and not o.get("kz_dec"):
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new("dec", "DECIMATE"); mod.ratio = b / cnt
        bpy.ops.object.modifier_apply(modifier="dec"); o["kz_dec"] = 1
    for c in o.users_collection: c.objects.unlink(o)
    o.location = (0, 0, 0)

def put(me, nm, x, y, s):
    o = bpy.data.objects.new("F_" + nm, me); o.location = (x, y, 0); o.scale = (s, s, s)
    o.rotation_euler[2] = random.uniform(0, 6.28); col.objects.link(o); return o
L, W = 90, 40
n = 0
while n < 240:
    x, y = random.uniform(-L / 2, L / 2), random.uniform(-W / 2, W / 2)
    if abs(y) < 3.2 + 0.8 * math.sin(x / 7): continue
    near = abs(y) < 6
    r = random.random()
    if r < 0.78: put(mesh[random.choice(["fir_a", "fir_b", "fir_c", "bro"] if not near else ["fir_c", "bro"])], "t", x, y, random.uniform(0.85, 1.35))
    elif r < 0.9: put(bpy.data.objects["dead_tree_trunk"].data, "log", x, y, random.uniform(0.9, 1.6))
    else: put(bpy.data.objects["tree_stump_01"].data, "stump", x, y, random.uniform(0.9, 1.5))
    n += 1

im = bpy.data.images["forrest_ground_03_Diffuse"]
if not im.get("kz_dark"):
    import numpy as np
    a = np.empty(len(im.pixels), dtype=np.float32); im.pixels.foreach_get(a)
    a.reshape(-1, 4)[:, :3] *= 0.5; im.pixels.foreach_set(a); im.update(); im["kz_dark"] = 1
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
g = bpy.context.active_object; g.name = "Ground"; g.scale = (L + 40, W + 30, 1)
bpy.ops.object.transform_apply(scale=True)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.subdivide(number_cuts=3); bpy.ops.object.mode_set(mode="OBJECT")
uv = g.data.uv_layers.active.data
for p in g.data.polygons:
    for i in p.loop_indices:
        v = g.data.vertices[g.data.loops[i].vertex_index].co; uv[i].uv = (v.x / 2, v.y / 2)
g.data.materials.append(bpy.data.materials["forrest_ground_03"])
for u in g.users_collection: u.objects.unlink(g)
col.objects.link(g)
print("objects", len(col.objects))

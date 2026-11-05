# The hero: MPFB2 human + height/build/muscle morph targets + the free Quaternius clips (CC0), exported as one skinned glTF.
# Run in Blender 5.x with MPFB2 installed (extension "mpfb"):
#   flatpak run --command=blender org.blender.Blender -b -P $PWD/game-assets/build/human.py
# The clips drive the pelvis, spine, neck, head and legs (direction retarget); the arms are scripted around our own rest pose
# (see LICENSES.md and 03-impl of the character run for why). Output: ~/.cache/kaizen-game/hero_raw.glb
import bpy, addon_utils, os, math, json
from mathutils import Matrix, Quaternion, Vector
for mod in ("humanservice", "targetservice"): pass
try:
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService
except Exception:
    addon_utils.enable("bl_ext.blender_org.mpfb", default_set=False, persistent=False)
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService
OUT = os.path.expanduser("~/.cache/kaizen-game")
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("bl_ext.blender_org.mpfb", default_set=False, persistent=False)
sc = bpy.context.scene

MPFB = os.path.expanduser("~/.var/app/org.blender.Blender/config/blender/5.2/extensions/.user/blender_org/mpfb/data")
# What the hero wears and what the creator can switch: object name -> mhclo (MakeHuman asset packs, all CC0; see LICENSES.md).
ASSETS = {
    "outfit-sweater": "clothes/toigo_fisherman_sweater/toigo_fisherman_sweater.mhclo",
    "outfit-pants": "clothes/toigo_wool_pants/toigo_wool_pants.mhclo",
    "brows": "eyebrows/mindfront_eyebrows_03/mindfront_eyebrows_03.mhclo",
    "beard-scruffy": "clothes/wdg_scruffy_beard/wdg_scruffy_beard.mhclo",
    "beard-faun": "clothes/culturalibre_faun_beard/culturalibre_faun_beard.mhclo",
    "beard-sigmund": "clothes/grinsegold_beard_sigmund_wip/grinsegold_beard_sigmund_wip.mhclo",
    "beard-viking": "clothes/rehmanpolanski_beard_viking/rehmanpolanski_beard_viking.mhclo",
    "beard-moustache": "clothes/rehmanpolanski_moustache_viking/rehmanpolanski_moustache_viking.mhclo",
}
ASSETS.update({k: v for k, v in json.loads(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "hair.json")).read()).items()} if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "hair.json")) else {})
def fit(body, rigged):
    out = {}
    for name, rel in ASSETS.items():
        o = HumanService.add_mhclo_asset(f"{MPFB}/{rel}", body, asset_type="Clothes", subdiv_levels=0, material_type="GAMEENGINE",
                                         set_up_rigging=rigged, interpolate_weights=rigged, import_weights=rigged)
        o.name = name; out[name] = o
        if name == "outfit-sweater":                         # the pants' waistband would show through the hem: lift the sweater 8 mm off the body
            o.data.update()
            for v in o.data.vertices: v.co = v.co + v.normal * 0.008
    return out

def macro(**over):
    d = TargetService.get_default_macro_info_dict(); d.update(over); return d
def mixed(o):
    """Vertex positions with MPFB's macro shape keys mixed in (the basis mesh itself never moves)."""
    k = o.shape_key_add(name="mix", from_mix=True); c = [d.co.copy() for d in k.data]; o.shape_key_remove(k); return c
def coords(**over):
    o = HumanService.create_human(mask_helpers=False, scale=0.1, macro_detail_dict=macro(**over)); c = mixed(o)
    worn = fit(o, False); a = {n: [v.co.copy() for v in w.data.vertices] for n, w in worn.items()}   # the assets refit on this body
    for w in worn.values(): bpy.data.objects.remove(w, do_unlink=True)
    bpy.data.objects.remove(o, do_unlink=True); return c, a

# morph targets: how far each slider moves the body (a slider value of 1 is the full delta, -1 the reverse)
variants = {"tall": (*coords(height=1.0), 0.3), "build": (*coords(weight=1.0), 1.5), "muscle": (*coords(muscle=1.0), 1.5),
            "male": (*coords(gender=1.0), 1.0), "female": (*coords(gender=0.0), 1.0)}   # the page drives male and female from one -1..1 slider
body = HumanService.create_human(mask_helpers=False, scale=0.1, macro_detail_dict=macro())
base = mixed(body)
bpy.context.view_layer.objects.active = body
bpy.ops.object.shape_key_remove(all=True, apply_mix=True)   # the neutral body becomes the basis; MPFB's own macro keys go
rig = HumanService.add_builtin_rig(body, "game_engine")
for old, new in (("Root", "root"), ("head", "Head")):        # the two names that differ from the library's skeleton
    rig.data.bones[old].name = new
    if old in body.vertex_groups: body.vertex_groups[old].name = new
worn = fit(body, True)                                   # the assets on the neutral body, weighted to the rig
base_assets = {n: [v.co.copy() for v in w.data.vertices] for n, w in worn.items()}
for w in worn.values():
    for vg_old, vg_new in (("Root", "root"), ("head", "Head")):
        if vg_old in w.vertex_groups: w.vertex_groups[vg_old].name = vg_new
    w.shape_key_add(name="Basis")
    for name, (cs, ca, k) in variants.items():
        key = w.shape_key_add(name=name, from_mix=False)
        for i, c in enumerate(ca[w.name]): key.data[i].co = base_assets[w.name][i] + (c - base_assets[w.name][i]) * k
body.shape_key_add(name="Basis")
for name, (cs, ca, k) in variants.items():
    key = body.shape_key_add(name=name, from_mix=False)
    for i, c in enumerate(cs): key.data[i].co = base[i] + (c - base[i]) * k
# eye centres, read before the helper geometry goes
def centre(group):
    vg = body.vertex_groups[group]; pts = [v.co.copy() for v in body.data.vertices if any(g.group == vg.index for g in v.groups)]
    return sum(pts, Vector()) / len(pts)
EYES = {"l": centre("joint-l-eye"), "r": centre("joint-r-eye")}
# keep the body and the two eyeballs, drop the rest of the helper geometry; shape keys follow the vertex deletion
for m in list(body.modifiers):
    if m.type == "MASK": body.modifiers.remove(m)
bpy.ops.object.select_all(action="DESELECT"); body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="DESELECT")
for g in ("body", "helper-l-eye", "helper-r-eye"):
    body.vertex_groups.active_index = body.vertex_groups[g].index; bpy.ops.object.vertex_group_select()
bpy.ops.mesh.select_all(action="INVERT"); bpy.ops.mesh.delete(type="VERT")
bpy.ops.object.mode_set(mode="OBJECT")
# materials: skin, eyes (white) and an iris per eye, found by name in three.js and recoloured there
def mat(name, rgb, rough, spec=0.4):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough
    for k in ("Specular IOR Level", "Specular"):
        if k in b.inputs: b.inputs[k].default_value = spec
    return m
body.data.materials.clear()
body.data.materials.append(mat("skin", (0.62, 0.33, 0.22), 0.55)); body.data.materials.append(mat("eyes", (0.9, 0.88, 0.84), 0.2))
eye_idx = {body.vertex_groups[g].index for g in ("helper-l-eye", "helper-r-eye")}
for p in body.data.polygons:
    p.material_index = 1 if all(any(g.group in eye_idx for g in body.data.vertices[v].groups) and not any(body.vertex_groups[g.group].name == "body" for g in body.data.vertices[v].groups) for v in p.vertices) else 0
body.name = "Body"
# iris and pupil: the front faces of each eyeball (the body's own helper geometry, so they follow every morph and the head bone)
body.data.materials.append(mat("iris", (0.23, 0.42, 0.56), 0.2)); body.data.materials.append(mat("pupil", (0.02, 0.02, 0.02), 0.2))
FRONT = Vector((0, -1, 0))
for p in body.data.polygons:
    if p.material_index != 1: continue
    c = sum((body.data.vertices[v].co for v in p.vertices), Vector()) / len(p.vertices)
    side = "l" if c.x > 0 else "r"
    d = (c - EYES[side]).normalized()
    if d.dot(FRONT) > math.cos(math.radians(16)): p.material_index = 3
    elif d.dot(FRONT) > math.cos(math.radians(34)): p.material_index = 2
irises = []
# --- the free Quaternius clips (CC0) retargeted onto our rig: each bone gets the clip's change from rest, in world space,
# applied to its own rest orientation, so differences in bone axes between the two skeletons cancel out.
from mathutils import Matrix, Quaternion, Vector
UAL = os.path.expanduser("~/.cache/kaizen-game/ual/Universal Animation Library[Standard].zip".replace(".zip", "")) + "/Unreal-Godot/UAL1_Standard.glb"
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=UAL)
new = [o for o in bpy.data.objects if o not in before]
src = next(o for o in new if o.type == "ARMATURE")
for o in new:
    if o.type == "MESH": bpy.data.objects.remove(o, do_unlink=True)
sc = bpy.context.scene
def toe_dir(a):
    a.data.pose_position = "REST"; bpy.context.view_layer.update()
    f = a.matrix_world @ a.pose.bones["foot_l"].head; b = a.matrix_world @ a.pose.bones["ball_l"].head
    d = (b - f); d.z = 0; return d.normalized()
ds, dt = toe_dir(src), toe_dir(rig)
print("FACING src", [round(x, 2) for x in ds], "tgt", [round(x, 2) for x in dt])
src.rotation_mode = "QUATERNION"
src.rotation_quaternion = ds.rotation_difference(dt)       # turn the source to face the way our body faces
bpy.context.view_layer.update()
src.data.pose_position = "POSE"; rig.data.pose_position = "POSE"
def rest_rot(a, n): return (a.matrix_world @ a.data.bones[n].matrix_local).to_quaternion()
def rest_head(a, n): return (a.matrix_world @ a.data.bones[n].matrix_local).to_translation()
depth = lambda b: len(b.parent_recursive)
common = [b.name for b in sorted(rig.data.bones, key=depth) if b.name in src.pose.bones]   # parents before children (bones are stored alphabetically)
print("COMMON", len(common), "of", len(rig.data.bones), "missing", [b.name for b in rig.data.bones if b.name not in src.pose.bones])
# Retarget only what the two skeletons agree on: pelvis, spine, neck, head and the legs. Their arms (T-pose clips on our A-pose
# skin) tear the shoulders, so the arms are scripted around our own rest pose instead.
LEGS = ("pelvis", "spine_", "neck_", "Head", "thigh_", "calf_", "foot_", "ball_")
common = [n for n in common if n.startswith(LEGS)]
ARMS = [b.name for b in sorted(rig.data.bones, key=lambda b: len(b.parent_recursive)) if b.name.startswith(("clavicle", "upperarm", "lowerarm", "hand", "index_", "middle_", "ring_", "pinky_", "thumb_"))]
scale = rest_head(rig, "Head").z / rest_head(src, "Head").z
src_rest = {n: rest_rot(src, n) for n in common}
tgt_rest = {n: rest_rot(rig, n) for n in common}
tgt_rest_dir = {n: tgt_rest[n] @ Vector((0, 1, 0)) for n in common}
for n in ARMS: tgt_rest[n] = rest_rot(rig, n)
import math
RX = lambda deg: Quaternion(Vector((1, 0, 0)), math.radians(deg))        # about the world X axis; our body faces -Y, so +deg swings a hanging arm backwards
smooth = lambda x: x * x * (3 - 2 * x)
def fwd(pb):                                                              # how far a leg bone points forward of straight down, in degrees
    d = (rig.matrix_world @ pb.matrix).to_quaternion() @ Vector((0, 1, 0))
    return math.degrees(math.atan2(-d.y, -d.z))
def arm_pose(name, f, f0, f1):
    t = (f - f0) / max(1, f1 - f0)
    sw = {"l": 0.0, "r": 0.0}; el = {"l": 0.0, "r": 0.0}
    if name.startswith("Walk") or name.startswith("Jog"):
        sw["l"] = -0.55 * fwd(rig.pose.bones["thigh_l"]) * -1 * -1
        sw["r"] = -0.55 * fwd(rig.pose.bones["thigh_r"]) * -1 * -1
        sw["l"], sw["r"] = -0.55 * fwd(rig.pose.bones["thigh_l"]), -0.55 * fwd(rig.pose.bones["thigh_r"])   # an arm swings with the opposite leg
        sw["l"], sw["r"] = sw["r"] * -1 * -1, sw["l"] * -1 * -1
        el = {"l": 12 + abs(sw["l"]) * 0.6, "r": 12 + abs(sw["r"]) * 0.6}
    elif name.startswith("Sword_Idle"):
        sw["r"] = -25.0; el["r"] = 55.0; el["l"] = 15.0
    elif name.startswith("Sword_Attack"):
        up = smooth(min(1, t / 0.35)) * (1 - smooth(max(0, min(1, (t - 0.35) / 0.2))))
        out = smooth(max(0, min(1, (t - 0.35) / 0.2))) * (1 - smooth(max(0, min(1, (t - 0.65) / 0.35))))
        sw["r"] = 115 * up - 80 * out - 25 * (1 - up - out if up + out < 1 else 0)
        el["r"] = 40 + 30 * up; el["l"] = 15
    else:
        el = {"l": 6, "r": 6}
    out = {}
    for n in ARMS:
        side = "l" if n.endswith("_l") else "r"
        if n.startswith("upperarm"): out[n] = RX(sw[side]) @ tgt_rest[n]
        elif n.startswith("lowerarm"):
            up_q = out["upperarm_" + side]
            out[n] = up_q @ (tgt_rest["upperarm_" + side].inverted() @ tgt_rest[n]) @ Quaternion(Vector((0, 0, 1)), 0)   # rest orientation relative to the upper arm
            out[n] = RX(-el[side]) @ out[n] if side == "l" else RX(-el[side]) @ out[n]
        else: out[n] = None
    return out
WANT = {"idle": "Idle_Loop", "walk": "Walk_Loop", "ready": "Sword_Idle", "attack": "Sword_Attack", "hit": "Hit_Chest", "die": "Death01"}
want = list(WANT.values())
src.animation_data_create(); rig.animation_data_create()
for pb in rig.pose.bones: pb.rotation_mode = "QUATERNION"
made = {}
for name in want:
    act = bpy.data.actions[name]
    src.animation_data.action = act
    if len(act.slots): src.animation_data.action_slot = act.slots[0]
    out = bpy.data.actions.new(name + "_ours"); out.use_fake_user = True
    rig.animation_data.action = out
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    for f in range(f0, f1 + 1):
        sc.frame_set(f); bpy.context.view_layer.update()
        for n in common:
            sp, tp = src.pose.bones[n], rig.pose.bones[n]
            ds_ = (src.matrix_world @ sp.matrix).to_quaternion() @ Vector((0, 1, 0))
            q = tgt_rest_dir[n].rotation_difference(ds_) @ tgt_rest[n]
            loc = (rig.matrix_world @ tp.matrix).to_translation()
            if n == "pelvis":
                loc = rest_head(rig, n) + ((src.matrix_world @ sp.matrix).to_translation() - rest_head(src, n)) * scale
            tp.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(loc) @ q.to_matrix().to_4x4())
            bpy.context.view_layer.update()
            tp.keyframe_insert("rotation_quaternion", frame=f)
            if n == "pelvis": tp.keyframe_insert("location", frame=f)
        poses = arm_pose(name, f, f0, f1)
        for n in ARMS:
            if poses.get(n) is None: continue
            tp = rig.pose.bones[n]
            loc = (rig.matrix_world @ tp.matrix).to_translation()
            tp.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(loc) @ poses[n].to_matrix().to_4x4())
            bpy.context.view_layer.update()
            tp.keyframe_insert("rotation_quaternion", frame=f)
    made[name] = out
    print("RETARGET", name, f0, f1)

# NLA tracks, so the exporter writes one named animation per clip
rig.animation_data.action = None
for key, lib in WANT.items():
    act = made[lib]; act.name = key
    tr = rig.animation_data.nla_tracks.new(); tr.name = key
    st = tr.strips.new(key, int(act.frame_range[0]), act); st.name = key
rig.animation_data.action = None
bpy.ops.object.select_all(action="DESELECT")
for o in [body, rig] + irises + list(worn.values()): o.select_set(True)
bpy.context.view_layer.objects.active = rig
src.select_set(False)
bpy.ops.export_scene.gltf(filepath=f"{OUT}/hero_raw.glb", use_selection=True, export_morph=True, export_skins=True, export_apply=False,
                          export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_yup=True)
print("EXPORTED", os.path.getsize(f"{OUT}/hero_raw.glb"), "TRIS", sum(len(p.vertices) - 2 for p in body.data.polygons), "KEYS", [k.name for k in body.data.shape_keys.key_blocks], "CLIPS", list(WANT))

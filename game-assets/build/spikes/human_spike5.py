# Spike: can MPFB2 (Blender 5.2) give one rigged human with morph targets that exports to glTF?
# Run: flatpak run --command=blender org.blender.Blender -b -P game-assets/build/human_spike.py
import bpy, addon_utils, os
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

def macro(**over):
    d = TargetService.get_default_macro_info_dict()
    d.update(over)
    return d

def mixed(o):
    """Vertex positions with MPFB's macro shape keys mixed in (the basis mesh itself never moves)."""
    k = o.shape_key_add(name="mix", from_mix=True)
    c = [d.co.copy() for d in k.data]
    o.shape_key_remove(k)
    return c

def coords(**over):
    o = HumanService.create_human(mask_helpers=False, scale=0.1, macro_detail_dict=macro(**over))
    c = mixed(o)
    bpy.data.objects.remove(o, do_unlink=True)
    return c

variants = {"height": coords(height=1.0), "build": coords(weight=1.0), "muscle": coords(muscle=1.0)}
body = HumanService.create_human(mask_helpers=False, scale=0.1, macro_detail_dict=macro())
base = mixed(body)
bpy.context.view_layer.objects.active = body
bpy.ops.object.shape_key_remove(all=True, apply_mix=True)   # the neutral body becomes the basis; MPFB's own macro keys go
rig = HumanService.add_builtin_rig(body, "game_engine")
for old, new in (("Root", "root"), ("head", "Head")):
    rig.data.bones[old].name = new
    if old in body.vertex_groups: body.vertex_groups[old].name = new
print("RIG", rig.name if rig else None, len(rig.data.bones) if rig else 0, sorted(b.name for b in rig.data.bones)[:4] if rig else [])
body.shape_key_add(name="Basis")
for name, cs in variants.items():
    k = body.shape_key_add(name=name, from_mix=False)
    for i, c in enumerate(cs): k.data[i].co = c
    print("SHAPE", name, "max delta", round(max((cs[i] - base[i]).length for i in range(len(cs))), 4))
# drop the helper geometry (everything outside the body group); shape keys follow the vertex deletion
bpy.context.view_layer.objects.active = body
for m in list(body.modifiers):
    if m.type == "MASK": body.modifiers.remove(m)
body.vertex_groups.active_index = body.vertex_groups["body"].index
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="DESELECT")
bpy.ops.object.vertex_group_select(); bpy.ops.mesh.select_all(action="INVERT"); bpy.ops.mesh.delete(type="VERT")
bpy.ops.object.mode_set(mode="OBJECT")
print("VERTS", len(body.data.vertices), "TRIS", sum(len(p.vertices) - 2 for p in body.data.polygons), "KEYS", [k.name for k in body.data.shape_keys.key_blocks])


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
want = ["Idle_Loop", "Walk_Loop", "Sword_Idle", "Sword_Attack"]
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
sc.render.engine = "BLENDER_WORKBENCH"; sc.render.resolution_x = 600; sc.render.resolution_y = 600
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.4; cam.location = (0, -6, 0.9); cam.rotation_euler = (1.5708, 0, 0)
src.hide_render = True
shots = [("Idle_Loop", 0.5), ("Walk_Loop", 0.25), ("Walk_Loop", 0.75), ("Sword_Idle", 0.5), ("Sword_Attack", 0.2), ("Sword_Attack", 0.5), ("Sword_Attack", 0.8)]
for name, t in shots:
    act = made[name]
    rig.animation_data.action = act
    if hasattr(act, "slots") and len(act.slots): rig.animation_data.action_slot = act.slots[0]
    sc.frame_set(int(act.frame_range[0] + t * (act.frame_range[1] - act.frame_range[0]))); bpy.context.view_layer.update()
    sc.render.filepath = f"{OUT}/spike5_{name}_{int(t*100)}.png"; bpy.ops.render.render(write_still=True)
print("DONE")

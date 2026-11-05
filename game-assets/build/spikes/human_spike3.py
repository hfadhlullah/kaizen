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
FINGERS = ('index_', 'middle_', 'ring_', 'pinky_', 'thumb_')
common = [n for n in common if not n.startswith(FINGERS) and not n.startswith('clavicle') and 'twist' not in n]   # fingers and clavicles stay at rest: retargeted by direction they tear the hands and lift the shoulders
src_rest = {n: rest_rot(src, n) for n in common}; tgt_rest = {n: rest_rot(rig, n) for n in common}
tgt_rest_dir = {n: tgt_rest[n] @ Vector((0, 1, 0)) for n in common}
scale = (rest_head(rig, "head" if "head" in rig.data.bones else "Head").z) / (rest_head(src, "Head").z)
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
    if hasattr(out, "slots") and not len(out.slots): rig.animation_data.action_slot = out.slots.new(id_type="OBJECT", name="Armature") if False else None
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    for f in range(f0, f1 + 1):
        sc.frame_set(f); bpy.context.view_layer.update()
        for n in common:
            sp, tp = src.pose.bones[n], rig.pose.bones[n]
            # The rigs rest differently (the library's body is in a T-pose, ours in an A-pose, the hands differ too), so
            # match where each bone points, not how far it turned: the minimal rotation from our rest direction to the
            # clip's direction, applied to our own rest orientation.
            ds_ = (src.matrix_world @ sp.matrix).to_quaternion() @ Vector((0, 1, 0))
            q = tgt_rest_dir[n].rotation_difference(ds_) @ tgt_rest[n]
            m = rig.matrix_world @ tp.matrix
            loc = m.to_translation()
            if n == "pelvis":                                    # the body bobs and sways with the clip, scaled to our height
                loc = rest_head(rig, n) + (src.matrix_world @ sp.matrix).to_translation().__sub__(rest_head(src, n)) * scale
            tp.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(loc) @ q.to_matrix().to_4x4())
            bpy.context.view_layer.update()
            tp.keyframe_insert("rotation_quaternion", frame=f)
            if n == "pelvis": tp.keyframe_insert("location", frame=f)
    made[name] = out
    print("RETARGET", name, f0, f1)
# look at mid-frames
sc.render.engine = "BLENDER_WORKBENCH"; sc.render.resolution_x = 600; sc.render.resolution_y = 600
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.4; cam.location = (0, -6, 0.9); cam.rotation_euler = (1.5708, 0, 0)
src.hide_render = True
for name, act in made.items():
    rig.animation_data.action = act
    if hasattr(act, "slots") and len(act.slots): rig.animation_data.action_slot = act.slots[0]
    sc.frame_set(int((act.frame_range[0] + act.frame_range[1]) / 2)); bpy.context.view_layer.update()
    sc.render.filepath = f"{OUT}/spike3_{name}.png"; bpy.ops.render.render(write_still=True)

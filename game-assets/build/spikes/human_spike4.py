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
print("VERTS", len(body.data.vertices))
from mathutils import Matrix, Vector
for old, new in (("Root", "root"), ("head", "Head")):
    rig.data.bones[old].name = new

# --- the library's skeleton and mannequin
UAL = os.path.expanduser("~/.cache/kaizen-game/ual/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb")
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=UAL)
new = [o for o in bpy.data.objects if o not in before]
arm = next(o for o in new if o.type == "ARMATURE"); man = next(o for o in new if o.name.startswith("Mannequin"))
for o in new:
    if o not in (arm, man): bpy.data.objects.remove(o, do_unlink=True)
sc = bpy.context.scene
arm.data.pose_position = "REST"; bpy.context.view_layer.update()

# --- 1. pose our body's arms into the library's T-pose (aim every arm bone where the library's bone points at rest)
ARM = ("upperarm", "lowerarm", "hand", "index_", "middle_", "ring_", "pinky_", "thumb_")
for pb in rig.pose.bones: pb.rotation_mode = "QUATERNION"
def rrot(a, n): return (a.matrix_world @ a.data.bones[n].matrix_local).to_quaternion()
def facing(a):
    f = a.matrix_world @ a.data.bones["foot_l"].head_local; b = a.matrix_world @ a.data.bones["ball_l"].head_local
    d = b - f; d.z = 0; return d.normalized()
arm.rotation_mode = "QUATERNION"; arm.rotation_quaternion = facing(arm).rotation_difference(facing(rig)); bpy.context.view_layer.update()
chain = sorted([b for b in rig.data.bones if b.name.startswith(ARM) and b.name in arm.data.bones], key=lambda b: len(b.parent_recursive))
def pose_into_T():
    for b in chain:
        pb = rig.pose.bones[b.name]
        want = (arm.matrix_world @ arm.data.bones[b.name].matrix_local).to_quaternion() @ Vector((0, 1, 0))
        have = rrot(rig, b.name) @ Vector((0, 1, 0))
        q = have.rotation_difference(want) @ rrot(rig, b.name)
        loc = (rig.matrix_world @ pb.matrix).to_translation()
        pb.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(loc) @ q.to_matrix().to_4x4())
        bpy.context.view_layer.update()
pose_into_T()

# --- 2. what the posed body looks like with each morph target on
keys = body.data.shape_keys.key_blocks
def posed():
    dg = bpy.context.evaluated_depsgraph_get()
    me = body.evaluated_get(dg).to_mesh()
    c = [body.matrix_world @ v.co for v in me.vertices]
    body.evaluated_get(dg).to_mesh_clear()
    return c
for k in keys: k.value = 0
bpy.context.view_layer.update(); base_posed = posed()
var_posed = {}
for k in keys[1:]:
    k.value = 1.0; bpy.context.view_layer.update(); var_posed[k.name] = posed(); k.value = 0
print("POSED", len(base_posed), {n: round(max((var_posed[n][i] - base_posed[i]).length for i in range(len(base_posed))), 3) for n in var_posed})

# --- 3. a fresh body: posed basis only, no rig, no old weights, no old shape keys (built from the arrays)
old = body.data
me = bpy.data.meshes.new("Body")
me.from_pydata([tuple(c) for c in base_posed], [], [tuple(p.vertices) for p in old.polygons]); me.update()
uvo = old.uv_layers.active
if uvo:
    uvn = me.uv_layers.new(name="UVMap")
    for li in range(len(me.loops)): uvn.data[li].uv = uvo.data[li].uv
for m in old.materials: me.materials.append(m)
for p_new, p_old in zip(me.polygons, old.polygons): p_new.material_index = p_old.material_index; p_new.use_smooth = p_old.use_smooth
nb = bpy.data.objects.new("Body", me); sc.collection.objects.link(nb)
bpy.data.objects.remove(body, do_unlink=True); bpy.data.objects.remove(rig, do_unlink=True)

# --- 4. line the mannequin up with our body (feet on the floor, same height), then copy its skin weights across
def zrange(o): zs = [(o.matrix_world @ Vector(c)).z for c in o.bound_box]; return min(zs), max(zs)
(bz0, bz1), (mz0, mz1) = zrange(nb), zrange(man)
s = (bz1 - bz0) / (mz1 - mz0)
ws = [man.matrix_world @ Vector(c) for c in man.bound_box]
print("MANBOX", [(round(min(w[i] for w in ws), 2), round(max(w[i] for w in ws), 2)) for i in range(3)], "ours", [(round(min((nb.matrix_world @ Vector(c))[i] for c in nb.bound_box), 2), round(max((nb.matrix_world @ Vector(c))[i] for c in nb.bound_box), 2)) for i in range(3)])
print("MAN groups", len(man.vertex_groups), "verts", len(man.data.vertices), "z", round(mz0,3), round(mz1,3), "loc", [round(x,3) for x in man.location], "scale", [round(x,3) for x in man.scale], "arm scale", [round(x,3) for x in arm.scale], "bz", round(bz0,3), round(bz1,3))
print("HEIGHTS ours", round(bz1 - bz0, 3), "mannequin", round(mz1 - mz0, 3), "scale", round(s, 3))
arm.scale = (s, s, s); arm.location.z += bz0 - mz0 * s
bpy.context.view_layer.update()
man.parent = arm; man.matrix_parent_inverse = Matrix.Identity(4)
for vg in man.vertex_groups: nb.vertex_groups.new(name=vg.name)   # the modifier fills groups that exist, matched by name
dt = nb.modifiers.new("dt", "DATA_TRANSFER")
dt.object = man; dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}
dt.vert_mapping = "POLYINTERP_NEAREST"; dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
bpy.context.view_layer.objects.active = nb
bpy.ops.object.datalayout_transfer(modifier="dt") if False else None
bpy.ops.object.modifier_apply(modifier="dt")
# fingers: our fingers do not line up with the mannequin's, so their transferred weights tear the hands; fold them into the hand bone
for side in ("l", "r"):
    hand = nb.vertex_groups[f"hand_{side}"]
    for vg in [g for g in nb.vertex_groups if g.name.endswith(f"_{side}") and g.name.startswith(("index_", "middle_", "ring_", "pinky_", "thumb_"))]:
        for v in nb.data.vertices:
            for ge in v.groups:
                if ge.group == vg.index and ge.weight > 0: hand.add([v.index], ge.weight, "ADD")
        nb.vertex_groups.remove(vg)
for v in nb.data.vertices:                                     # weights per vertex sum to at most 1 again
    tot = sum(g.weight for g in v.groups)
    if tot > 1.0:
        for g in list(v.groups): nb.vertex_groups[g.group].add([v.index], g.weight / tot, "REPLACE")
print("GROUPS", len(nb.vertex_groups))
# the T-pose body now keeps its shape keys from the posed variants
nb.shape_key_add(name="Basis")
for n, cs in var_posed.items():
    k = nb.shape_key_add(name=n, from_mix=False)
    for i, c in enumerate(cs): k.data[i].co = c
bpy.data.objects.remove(man, do_unlink=True)
nb.parent = arm; nb.matrix_parent_inverse = arm.matrix_world.inverted()
mod = nb.modifiers.new("Armature", "ARMATURE"); mod.object = arm
arm.data.pose_position = "POSE"
print("KEYS", [k.name for k in nb.data.shape_keys.key_blocks], "TRIS", sum(len(p.vertices) - 2 for p in nb.data.polygons))

# --- 5. play the library's own clips on it and look
sc.render.engine = "BLENDER_WORKBENCH"; sc.render.resolution_x = 600; sc.render.resolution_y = 600
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.4; cam.location = (0, -6, 0.9); cam.rotation_euler = (1.5708, 0, 0)
arm.rotation_quaternion = (1, 0, 0, 0) if False else arm.rotation_quaternion
arm.animation_data_create()
for name in ["Idle_Loop", "Walk_Loop", "Sword_Idle", "Sword_Attack"]:
    act = bpy.data.actions[name]
    arm.animation_data.action = act
    if len(act.slots): arm.animation_data.action_slot = act.slots[0]
    sc.frame_set(int((act.frame_range[0] + act.frame_range[1]) / 2)); bpy.context.view_layer.update()
    sc.render.filepath = f"{OUT}/spike4_{name}.png"; bpy.ops.render.render(write_still=True)
print("DONE")

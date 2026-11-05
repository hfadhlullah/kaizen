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

# --- the free Quaternius clips (CC0) on our rig, by bone name
UAL = os.path.expanduser("~/.cache/kaizen-game/ual/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb")
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=UAL)
new = [o for o in bpy.data.objects if o not in before]
print("IMPORTED", [(o.name, o.type) for o in new][:6], "ACTIONS", len(bpy.data.actions))
for o in new: bpy.data.objects.remove(o, do_unlink=True)
want = ["Idle_Loop", "Walk_Loop", "Sword_Idle", "Sword_Attack"]
ad = rig.animation_data_create()
rig.rotation_mode = "QUATERNION"
for pb in rig.pose.bones: pb.rotation_mode = "QUATERNION"   # the clips key quaternions; MPFB leaves the bones on Euler
# render a mid-frame of two clips in workbench to look at the pose
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.render.resolution_x = 600; sc.render.resolution_y = 600
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.4; cam.location = (0, -6, 0.9); cam.rotation_euler = (1.5708, 0, 0)
body.hide_render = False
for name in want:
    act = bpy.data.actions.get(name)
    print("ACTION", name, bool(act), (round(act.frame_range[0]), round(act.frame_range[1])) if act else None)
    if not act: continue
    ad.action = act
    if getattr(act, 'slots', None) and len(act.slots): ad.action_slot = act.slots[0]
    print('SLOTS', name, [sl.name_display for sl in act.slots], 'fcurves', len(list(act.layers[0].strips[0].channelbag(act.slots[0]).fcurves)) if act.slots else 0)
    mid = int((act.frame_range[0] + act.frame_range[1]) / 2)
    sc.frame_set(mid); bpy.context.view_layer.update()
    pb = rig.pose.bones
    print('POSE', name, 'mod', [(m.type, m.object.name if getattr(m,'object',None) else None) for m in body.modifiers], 'parent', body.parent.name if body.parent else None, 'upperarm_l q', [round(x,3) for x in pb['upperarm_l'].rotation_quaternion], 'thigh_l', [round(x,3) for x in pb['thigh_l'].rotation_quaternion], 'rot mode', pb['thigh_l'].rotation_mode, 'fc paths', sorted({fc.data_path for fc in act.layers[0].strips[0].channelbag(act.slots[0]).fcurves})[:3])
    sc.render.filepath = f"{OUT}/spike_{name}.png"
    bpy.ops.render.render(write_still=True)

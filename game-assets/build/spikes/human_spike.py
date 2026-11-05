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
rig = HumanService.add_builtin_rig(body, "mixamo")
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
bpy.ops.object.select_all(action="DESELECT"); body.select_set(True); rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=f"{OUT}/human_spike.glb", use_selection=True, export_morph=True, export_skins=True, export_apply=False)
print("EXPORTED", os.path.getsize(f"{OUT}/human_spike.glb"))

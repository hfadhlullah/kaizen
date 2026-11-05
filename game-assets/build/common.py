# Shared helpers for the dungeon and town scenes (run inside Blender; exec this file first).
# World: Blender X along the track, +Y away from the camera, Z up (glTF export turns it into Y up, camera on +Z).
import bpy, bmesh, math, random, os
from mathutils import Vector
BB = os.path.expanduser("~/.cache/kaizen-game/bb")
TILE = {"cobblestone_floor_02": 2, "plastered_wall_02": 2.23, "roof_09": 4, "wood_planks": 1.5,
        "medieval_blocks_03": 2, "stone_floor": 1.85, "dark_wooden_planks": 2}   # metres one texture repeat covers

def collection(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(c)
    for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
    return c

def mesh_obj(col, name, verts, faces, mat, uvs=None):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    me.materials.append(bpy.data.materials[mat])
    uv = me.uv_layers.new(name="UVMap"); t = TILE[mat]
    for p in me.polygons:
        n = p.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = [(1, 2), (0, 2), (0, 1)][ax]
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co; uv.data[li].uv = (v[a] / t, v[b] / t)
    o = bpy.data.objects.new(name, me); col.objects.link(o); return o

def box(col, name, x0, x1, y0, y1, z0, z1, mat):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh_obj(col, name, v, f, mat)

def prop_clean():
    """Keep one barrel pair, one joined crate, the fire pit and one rock from the Poly Haven imports."""
    keep = {"wooden_barrels_01_barrel01", "wooden_barrels_01_barrel02", "wooden_military_crate", "stone_fire_pit", "rock_07_LOD0"}
    parts = [bpy.data.objects.get(n) for n in ("wooden_military_crate", "wooden_military_crate_latch", "wooden_military_crate_lid")]
    if all(parts) and not parts[0].get("kz_joined"):
        bpy.ops.object.select_all(action="DESELECT")
        for p in parts: p.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); parts[0]["kz_joined"] = 1
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o.name not in keep and not o.name.startswith(("D_", "T_", "Ground")): bpy.data.objects.remove(o, do_unlink=True)
    rock = bpy.data.objects["rock_07_LOD0"]
    if len(rock.data.polygons) > 3000 and not rock.get("kz_dec"):
        bpy.context.view_layer.objects.active = rock
        m = rock.modifiers.new("dec", "DECIMATE"); m.ratio = 3000 / len(rock.data.polygons)
        bpy.ops.object.modifier_apply(modifier="dec"); rock["kz_dec"] = 1
    for n in keep:
        o = bpy.data.objects[n]
        for c in list(o.users_collection): c.objects.unlink(o)
        o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0)
    return {n: bpy.data.objects[n].data for n in keep}

def put(col, me, name, x, y, z=0.0, s=1.0, rz=0.0):
    o = bpy.data.objects.new(name, me); o.location = (x, y, z); o.scale = (s, s, s); o.rotation_euler[2] = rz
    col.objects.link(o); return o

def export_glb(col, path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in col.objects: o.select_set(True)
    bpy.context.view_layer.objects.active = list(col.objects)[0]
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_apply=True)
    print("exported", path, os.path.getsize(path))

def tint(image_name, rgb):
    """Multiply an image's colour in place (once per session): the scans are paler than a lived-in town."""
    import numpy as np
    im = bpy.data.images[image_name]
    im.reload()
    a = np.empty(len(im.pixels), dtype=np.float32); im.pixels.foreach_get(a)
    v = a.reshape(-1, 4)
    for i in range(3): v[:, i] *= rgb[i]
    im.pixels.foreach_set(a); im.update()

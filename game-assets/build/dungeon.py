# Dungeon scene: one 20 m stone corridor segment that the page tiles along the track. exec common.py first.
import bpy, math, random
random.seed(11)
col = collection("Dungeon")
L = 20.0
P = prop_clean()
box(col, "D_floor", 0, L, -4, 4, -0.6, 0, "stone_floor")
box(col, "D_wall", 0, L, 3.0, 4.0, 0, 8, "medieval_blocks_03")
box(col, "D_ceiling", 0, L, -4, 4, 8, 8.6, "medieval_blocks_03")
for i in range(4):                                           # a pillar and a cross beam every 5 m
    x = i * 5 + 0.5
    box(col, f"D_pillar{i}", x - 0.5, x + 0.5, 2.0, 3.0, 0, 8, "medieval_blocks_03")
    box(col, f"D_beam{i}", x - 0.4, x + 0.4, -4, 3.0, 7.2, 8.0, "dark_wooden_planks")
box(col, "D_rail", 0, L, 3.0 - 0.0, 3.0, 7.9, 8.0, "dark_wooden_planks")
for i in range(4):                                           # torches between the pillars (flame is emissive)
    x = i * 5 + 3.0
    box(col, f"D_bracket{i}", x - 0.06, x + 0.06, 2.75, 3.0, 3.0, 3.8, "dark_wooden_planks")
    fl = bpy.data.materials.get("flame") or bpy.data.materials.new("flame"); fl.use_nodes = True
    bs = next(n for n in fl.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (1, 0.45, 0.1, 1); bs.inputs["Emission Color"].default_value = (1, 0.45, 0.1, 1); bs.inputs["Emission Strength"].default_value = 6
    me = bpy.data.meshes.new(f"flame{i}")
    h = 0.5; w = 0.16; me.from_pydata([(-w, 0, 0), (w, 0, 0), (0, 0, h), (0, -w, 0), (0, w, 0)], [], [(0, 1, 2), (3, 4, 2)])
    me.materials.append(fl); o = bpy.data.objects.new(f"D_flame{i}", me); o.location = (x, 2.75, 3.8); col.objects.link(o)
for i, n in enumerate(["wooden_barrels_01_barrel01", "wooden_barrels_01_barrel02"]):
    put(col, P[n], f"D_barrel{i}", 6.5 + i * 0.9, 2.3, 0, 1.0, random.uniform(0, 6))
put(col, P["wooden_barrels_01_barrel01"], "D_barrel2", 7.1, 2.3, 0.92, 1.0, 1.0)
put(col, P["wooden_military_crate"], "D_crate0", 13.5, 2.4, 0, 1.2, 0.2)
put(col, P["wooden_military_crate"], "D_crate1", 13.7, 2.4, 0.42 * 1.2, 1.2, -0.3)
put(col, P["rock_07_LOD0"], "D_rock0", 17.5, 2.0, 0, 5.0, 0.7)
put(col, P["rock_07_LOD0"], "D_rock1", 2.0, 2.2, 0, 3.5, 2.0)
export_glb(col, os.path.expanduser("~/.cache/kaizen-game/dungeon.glb"))

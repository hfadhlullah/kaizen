# Town scene: a cobbled square with a ring of houses, props and forest beyond it. The page draws the guild
# buildings in the middle (radius 30 m stays free); this is only the surroundings. exec common.py first.
import bpy, math, random
random.seed(5)
col = collection("Town")
P = prop_clean()
tint("plastered_wall_02_Diffuse", (0.95, 0.88, 0.76))
R = 90
box(col, "T_ground", -R, R, -R, R, -0.5, 0, "cobblestone_floor_02")

def house(i, x, y, rz, w, d, h, rh):                         # walls, gabled roof (ridge along local X), door
    ca, sa = math.cos(rz), math.sin(rz)
    def t(px, py, pz): return (x + px * ca - py * sa, y + px * sa + py * ca, pz)
    hw, hd = w / 2, d / 2
    wall = [t(-hw, -hd, 0), t(hw, -hd, 0), t(hw, hd, 0), t(-hw, hd, 0), t(-hw, -hd, h), t(hw, -hd, h), t(hw, hd, h), t(-hw, hd, h)]
    mesh_obj(col, f"T_house{i}", wall, [(0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], "plastered_wall_02")
    o = 0.5                                                    # eaves overhang
    ro = [t(-hw - o, -hd - o, h), t(hw + o, -hd - o, h), t(hw + o, hd + o, h), t(-hw - o, hd + o, h), t(-hw - o, 0, h + rh), t(hw + o, 0, h + rh)]
    mesh_obj(col, f"T_roof{i}", ro, [(0, 1, 5, 4), (2, 3, 4, 5)], "roof_09")
    gab = [t(-hw, -hd, h), t(-hw, hd, h), t(-hw, 0, h + rh), t(hw, -hd, h), t(hw, hd, h), t(hw, 0, h + rh)]
    mesh_obj(col, f"T_gable{i}", gab, [(0, 2, 1), (3, 4, 5)], "plastered_wall_02")
    box_door = [t(-0.5, -hd - 0.02, 0), t(0.5, -hd - 0.02, 0), t(0.5, -hd - 0.02, 2.0), t(-0.5, -hd - 0.02, 2.0)]
    mesh_obj(col, f"T_door{i}", box_door, [(0, 1, 2, 3)], "wood_planks")

n = 0
for k in range(20):                                          # ring of houses facing the square
    a = k / 20 * math.tau + random.uniform(-0.05, 0.05); r = random.uniform(36, 42)
    house(n, r * math.cos(a), r * math.sin(a), a + math.pi / 2 * 0 + math.pi, random.uniform(6, 9), random.uniform(5, 8), random.uniform(4.5, 7), random.uniform(2.5, 4)); n += 1
# market clutter and a fire pit toward the front, outside the guild grid
for i in range(14):
    a = random.uniform(0, math.tau); r = random.uniform(27, 31)
    me = random.choice([P["wooden_barrels_01_barrel01"], P["wooden_barrels_01_barrel02"], P["wooden_military_crate"]])
    put(col, me, f"T_prop{i}", r * math.cos(a), r * math.sin(a), 0, 1.3, random.uniform(0, 6))
put(col, P["stone_fire_pit"], "T_pit", 0, -27, 0, 1.6, 0)
for i in range(10):
    a = random.uniform(0, math.tau); r = random.uniform(31, 60)
    put(col, P["rock_07_LOD0"], f"T_rock{i}", r * math.cos(a), r * math.sin(a), 0, random.uniform(5, 14), random.uniform(0, 6))

# forest ring beyond the houses: crossed billboard cards, same as the forest scene
def card_mesh(name, w, h):
    me = bpy.data.meshes.new(name); hw = w / 2
    me.from_pydata([(-hw, 0, 0), (hw, 0, 0), (hw, 0, h), (-hw, 0, h), (0, -hw, 0), (0, hw, 0), (0, hw, h), (0, -hw, h)], [], [(0, 1, 2, 3), (4, 5, 6, 7)])
    uv = me.uv_layers.new(name="UVMap")
    for i, (u, v) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)] * 2): uv.data[i].uv = (u, v)
    return me
def card_mat(name, f):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bs = nt.nodes.new("ShaderNodeBsdfPrincipled"); tx = nt.nodes.new("ShaderNodeTexImage")
    tx.image = bpy.data.images.load(f"{BB}/{f}", check_existing=True); tx.extension = "CLIP"
    nt.links.new(tx.outputs["Color"], bs.inputs["Base Color"]); nt.links.new(tx.outputs["Alpha"], bs.inputs["Alpha"])
    bs.inputs["Roughness"].default_value = 1.0; nt.links.new(bs.outputs["BSDF"], out.inputs["Surface"])
    return m
T = {"fir_a": ("fir_sapling_medium_a_LOD0", 5.49, 8.83), "fir_b": ("fir_sapling_medium_b_LOD0", 4.46, 7.8),
     "fir_c": ("fir_sapling_medium_c_LOD0", 4.48, 5.91), "bro": ("tree_small_02_LOD0", 4.46, 4.56)}
tm = {}
for k, (src, w, h) in T.items():
    me = card_mesh("card_" + k, w, h); me.materials.append(card_mat("card_" + k, src + "_0.png")); me.materials.append(card_mat("card_" + k + "_90", src + "_90.png"))
    for i, p in enumerate(me.polygons): p.material_index = i
    tm[k] = me
for i in range(130):
    a = random.uniform(0, math.tau); r = random.uniform(46, 80)
    put(col, tm[random.choice(list(tm))], f"T_tree{i}", r * math.cos(a), r * math.sin(a), 0, random.uniform(1.0, 1.7), random.uniform(0, 6))
export_glb(col, os.path.expanduser("~/.cache/kaizen-game/town.glb"))

"""
Blender scene: the "layered data" exploded view. Five NASA data layers of the same 11.8 x 14.8 km patch of Gale Crater,
stacked and pulled apart, with thin light lines tying the same places together across layers.

Run (after export_routes.mjs and prep_layers.py):
    blender -b --factory-startup -P tools/blender/layered_data.py -- [--preview]
Writes tools/blender/build/layered_render.png and tools/blender/build/layered_anchors.json (screen positions for labels).
"""
import json
import math
import os
import sys

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = os.environ.get("NASA_REPO", r"c:\Users\sport\OneDrive\Documents\CodingPersonal\NASA-Hackathon")
BUILD = os.path.join(ROOT, "tools", "blender", "build")
CACHE = os.path.join(ROOT, "data-cache", "gale_dem_msl_946x1186.npy")
PREVIEW = "--preview" in sys.argv

routes = json.load(open(os.path.join(BUILD, "routes.json")))
SIZE_X, SIZE_Y = routes["sizeM"]  # metres east-west, north-south
UNIT = 8.0 / SIZE_X  # Blender units per metre: the stack is 8 units wide
W, H = SIZE_X * UNIT, SIZE_Y * UNIT

# ---------------------------------------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.device = "CPU"
scn.cycles.samples = 40 if PREVIEW else 160
scn.cycles.use_denoising = True
scn.cycles.max_bounces = 4
scn.render.resolution_x, scn.render.resolution_y = (1920, 1080) if PREVIEW else (3840, 2160)
scn.render.resolution_percentage = 100
scn.view_settings.view_transform = "Standard"  # keep the data colours as they are
scn.view_settings.look = "None"
scn.render.filepath = os.path.join(BUILD, "layered_render_preview.png" if PREVIEW else "layered_render.png")

world = bpy.data.worlds.new("w")
scn.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.0012, 0.0014, 0.0026, 1.0)
bg.inputs[1].default_value = 1.0


# ---------------------------------------------------------------------------------------------- materials
def image_material(name, path, strength=1.0, rough=0.6):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path)
    tex.image.colorspace_settings.name = "sRGB"
    tex.interpolation = "Cubic"
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = strength
    nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def lit_image_material(name, path):
    """Image-tinted surface that reacts to the sun (used for the 3D terrain)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path)
    tex.image.colorspace_settings.name = "sRGB"
    pb = nt.nodes.new("ShaderNodeBsdfPrincipled")
    pb.inputs["Roughness"].default_value = 0.85
    nt.links.new(tex.outputs["Color"], pb.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], pb.inputs["Emission Color"])
    pb.inputs["Emission Strength"].default_value = 0.45
    nt.links.new(pb.outputs["BSDF"], out.inputs["Surface"])
    return mat


def flat_emission(name, color, strength=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1.0)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def solid(name, color, rough=0.9):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    pb = mat.node_tree.nodes["Principled BSDF"]
    pb.inputs["Base Color"].default_value = (*color, 1.0)
    pb.inputs["Roughness"].default_value = rough
    return mat


# ---------------------------------------------------------------------------------------------- slabs
THICK = 0.09
EDGE = flat_emission("edge", (0.80, 0.86, 1.0), 2.2)


def make_slab(name, tex_path, z_top, strength=1.0):
    """A thin box whose top face carries the texture (north = +y) and whose sides glow like glass edges."""
    x0, x1, y0, y1 = -W / 2, W / 2, -H / 2, H / 2
    z0, z1 = z_top - THICK, z_top
    verts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    faces = [(4, 5, 6, 7), (0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    uv = me.uv_layers.new(name="UV")
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((v.x - x0) / W, (v.y - y0) / H)
    top = image_material(name + "_top", tex_path, strength)
    me.materials.append(top)
    me.materials.append(EDGE)
    for i, poly in enumerate(me.polygons):
        poly.material_index = 0 if i == 0 else 1
    ob = bpy.data.objects.new(name, me)
    scn.collection.objects.link(ob)
    ob.visible_shadow = False  # layers must not shade each other
    return ob


Z = {"relief": 0.0, "hazard": 5.4, "thermal": 9.9, "optical": 14.4, "plan": 18.9}
make_slab("hazard", os.path.join(BUILD, "hazard.png"), Z["hazard"], 0.95)
make_slab("thermal", os.path.join(BUILD, "thermal.jpg"), Z["thermal"], 1.0)
make_slab("optical", os.path.join(BUILD, "optical.jpg"), Z["optical"], 1.0)
make_slab("plan", os.path.join(BUILD, "plan.png"), Z["plan"], 1.0)

# ---------------------------------------------------------------------------------------------- 3D terrain (bottom layer)
dem = np.load(CACHE)[0].astype(np.float32)  # 1186 x 946 at 12.5 m
step = 2
dem = dem[::step, ::step]  # 593 x 473, about 25 m: plenty for a graphic
rows, cols = dem.shape
EXAG = 2.2
dmin, dmax = float(dem.min()), float(dem.max())
base_z = 0.45  # the terrain block's lowest top-surface height
heights = base_z + (dem - dmin) * UNIT * EXAG
xs = (np.arange(cols) + 0.5) / cols * W - W / 2
ys = H / 2 - (np.arange(rows) + 0.5) / rows * H  # row 0 = north = +y
gx, gy = np.meshgrid(xs, ys)
top_v = np.stack([gx, gy, heights], axis=-1).reshape(-1, 3)
# a skirt down to z = -THICK on all four sides, closed with a bottom face
bottom_z = -THICK
verts = [tuple(v) for v in top_v]
faces = []
for r in range(rows - 1):
    base = r * cols
    for c in range(cols - 1):
        a = base + c
        faces.append((a, a + cols, a + cols + 1, a + 1))  # counter-clockwise seen from above (+z)
n_top = len(verts)
edge_idx = (
    [(0, c) for c in range(cols)],
    [(r, cols - 1) for r in range(rows)],
    [(rows - 1, c) for c in range(cols - 1, -1, -1)],
    [(r, 0) for r in range(rows - 1, -1, -1)],
)
wall_faces = []
ring = [rc for side in edge_idx for rc in side]
ring_top = [r * cols + c for r, c in ring]
ring_bot = []
for r, c in ring:
    ring_bot.append(len(verts))
    verts.append((float(gx[r, c]), float(gy[r, c]), bottom_z))
for i in range(len(ring)):
    j = (i + 1) % len(ring)
    wall_faces.append((ring_top[i], ring_bot[i], ring_bot[j], ring_top[j]))
bottom_face = tuple(reversed(ring_bot))
me = bpy.data.meshes.new("relief")
me.from_pydata(verts, [], faces + wall_faces + [bottom_face])
me.update()
uv = me.uv_layers.new(name="UV")
for poly in me.polygons:
    for li in poly.loop_indices:
        v = me.vertices[me.loops[li].vertex_index].co
        uv.data[li].uv = ((v.x + W / 2) / W, (v.y + H / 2) / H)
me.materials.append(lit_image_material("relief_top", os.path.join(BUILD, "relief.png")))
me.materials.append(solid("relief_side", (0.05, 0.05, 0.07)))
n_top_faces = len(faces)
for i, poly in enumerate(me.polygons):
    poly.material_index = 0 if i < n_top_faces else 1
me.polygons.foreach_set("use_smooth", [i < n_top_faces for i in range(len(me.polygons))])
relief = bpy.data.objects.new("relief", me)
scn.collection.objects.link(relief)
relief.visible_shadow = True

# ---------------------------------------------------------------------------------------------- light posts and connectors
CORNER = flat_emission("corner", (0.30, 0.34, 0.46), 0.7)


def cyl(p0, p1, r, mat):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=r, depth=d.length, location=(p0 + p1) / 2)
    ob = bpy.context.active_object
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = d.to_track_quat("Z", "Y")
    ob.data.materials.append(mat)
    ob.visible_shadow = False
    return ob


def dot(p, r, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=r, location=p)
    ob = bpy.context.active_object
    ob.data.materials.append(mat)
    ob.visible_shadow = False
    return ob


top_z = Z["plan"]
for sx in (-1, 1):
    for sy in (-1, 1):
        cyl((sx * W / 2, sy * H / 2, -THICK), (sx * W / 2, sy * H / 2, top_z), 0.007, CORNER)


def to_bu(xz):
    return (xz[0] * UNIT - W / 2, H / 2 - xz[1] * UNIT)


def terrain_z(x, y):
    c = int(np.clip((x + W / 2) / W * cols, 0, cols - 1))
    r = int(np.clip((H / 2 - y) / H * rows, 0, rows - 1))
    return float(heights[r, c])


anchors_world = {}
marks = [("base", routes["base"]["xz"], (1.0, 0.57, 0.22)), ("pahrump", next(p["xz"] for p in routes["pois"] if p["id"] == "pahrump"), (0.66, 0.55, 0.98))]
for key, xz, col in marks:
    x, y = to_bu(xz)
    mat = flat_emission("m_" + key, col, 6.0)
    zs = [terrain_z(x, y) + 0.02, Z["hazard"], Z["thermal"], Z["optical"], Z["plan"]]
    for i in range(len(zs) - 1):
        z_from = zs[i] if i == 0 else zs[i]  # top of slab i
        z_to = zs[i + 1] - THICK  # underside of slab i + 1
        cyl((x, y, z_from), (x, y, z_to), 0.018, mat)
    for z in zs:
        dot((x, y, z), 0.075, mat)

# ---------------------------------------------------------------------------------------------- lights and camera
sun_data = bpy.data.lights.new("sun", "SUN")
sun_data.energy = 3.2
sun_data.angle = math.radians(1.2)
sun = bpy.data.objects.new("sun", sun_data)
sun.rotation_euler = (math.radians(52), 0, math.radians(-130))  # from the north-west, like a hillshade
scn.collection.objects.link(sun)
fill = bpy.data.lights.new("fill", "AREA")
fill.energy = 240
fill.size = 14
fo = bpy.data.objects.new("fill", fill)
fo.location = (-9, -12, 9)
fo.rotation_euler = (math.radians(60), 0, math.radians(-35))
scn.collection.objects.link(fo)

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 38
cam_data.shift_x = 0.09  # slide the stack to the left; the labels live on the right
cam = bpy.data.objects.new("cam", cam_data)
scn.collection.objects.link(cam)
scn.camera = cam
cam.location = (-14.0, -38.5, 30.0)
target = Vector((0.3, 0.6, 9.4))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------------------------------------- label anchors
bpy.context.view_layer.update()  # new objects have an identity matrix until this runs


def screen(p):
    c = world_to_camera_view(scn, cam, Vector(p))
    return [round(c.x * scn.render.resolution_x, 1), round((1 - c.y) * scn.render.resolution_y, 1)]


anchors = {"resolution": [scn.render.resolution_x, scn.render.resolution_y], "layers": {}, "marks": {}}
for name in ("plan", "optical", "thermal", "hazard"):
    z = Z[name]
    anchors["layers"][name] = {
        "right": screen((W / 2, 0, z - THICK / 2)),
        "left": screen((-W / 2, 0, z - THICK / 2)),
        "front": screen((0, -H / 2, z - THICK / 2)),
        "frontRight": screen((W / 2, -H / 2, z - THICK / 2)),
        "frontLeft": screen((-W / 2, -H / 2, z - THICK / 2)),
        "backRight": screen((W / 2, H / 2, z - THICK / 2)),
    }
tz = float(heights.max()) * 0.5
anchors["layers"]["relief"] = {
    "right": screen((W / 2, 0, tz * 0.5)),
    "left": screen((-W / 2, 0, tz * 0.5)),
    "front": screen((0, -H / 2, tz * 0.5)),
    "frontRight": screen((W / 2, -H / 2, 0.0)),
    "frontLeft": screen((-W / 2, -H / 2, 0.0)),
    "backRight": screen((W / 2, H / 2, tz * 0.5)),
}
for key, xz, col in marks:
    x, y = to_bu(xz)
    anchors["marks"][key] = [screen((x, y, z)) for z in (terrain_z(x, y), Z["hazard"], Z["thermal"], Z["optical"], Z["plan"])]
json.dump(anchors, open(os.path.join(BUILD, "layered_anchors.json"), "w"))

bpy.ops.render.render(write_still=True)
print("LAYERED_RENDER_DONE", scn.render.filepath)

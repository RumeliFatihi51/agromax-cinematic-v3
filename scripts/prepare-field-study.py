"""Blender 5.2. Run from the repo root after obtaining the CC0 sources in docs/AGROMAX_3D.md."""
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path.cwd()
SOURCE = ROOT / "data/spatial-source"
OUT = ROOT / "../../outputs/agromax-terrain-v2"
PUBLIC = ROOT / "public/visuals"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)


def active_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def export(path):
    bpy.ops.export_scene.gltf(filepath=str(path.resolve()), export_format="GLB",
                             use_selection=True, export_gpu_instances=True, export_image_format="WEBP",
                             export_image_quality=81)


bpy.ops.import_scene.gltf(filepath=str(SOURCE / "wheat-source.glb"))
wheat = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.name.endswith("stage4"))
world = wheat.matrix_world.copy()
wheat.parent = None
wheat.matrix_world = world
for obj in list(bpy.context.scene.objects):
    if obj != wheat:
        bpy.data.objects.remove(obj, do_unlink=True)
wheat.name = "Wheat · ripe clump"
wheat.location = (0, 0, 0)
active_only(wheat)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
mesh = bmesh.new()
mesh.from_mesh(wheat.data)
bmesh.ops.delete(mesh, geom=[face for face in mesh.faces
    if max(vertex.co.z for vertex in face.verts) < 0.054], context="FACES")
bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
mesh.to_mesh(wheat.data)
mesh.free()
modifier = wheat.modifiers.new("Web mesh reduction", "DECIMATE")
modifier.ratio = 0.19
bpy.ops.object.modifier_apply(modifier=modifier.name)
for mat in wheat.data.materials:
    for node in mat.node_tree.nodes:
        if node.type == "TEX_IMAGE" and max(node.image.size) > 512:
            node.image.scale(512, 512)
            node.image.pack()
export(PUBLIC / "spatial-wheat.glb")
detail_mesh = wheat.data
wheat.data = detail_mesh.copy()
modifier = wheat.modifiers.new("Instanced field LOD", "DECIMATE")
modifier.ratio = 0.26
bpy.ops.object.modifier_apply(modifier=modifier.name)


def soil_material():
    mat = bpy.data.materials.new("Photoscanned loam · Poly Haven")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    for filename, target in (("soil-color.jpg", "Base Color"), ("soil-rough.jpg", "Roughness"),
                             ("soil-normal.jpg", "Normal")):
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(SOURCE / filename), check_existing=True)
        node.image.scale(512, 512)
        if target != "Base Color":
            node.image.colorspace_settings.name = "Non-Color"
        node.image.pack()
        if target == "Normal":
            normal = nodes.new("ShaderNodeNormalMap")
            normal.inputs["Strength"].default_value = 0.42
            links.new(node.outputs["Color"], normal.inputs["Color"])
            links.new(normal.outputs["Normal"], shader.inputs[target])
        else:
            links.new(node.outputs["Color"], shader.inputs[target])
    return mat


def height(x, y):
    ripples = 0.018 * math.cos((y - 0.72 * math.sin(x / 7)) * math.tau / 0.64)
    return 0.026 * y + 0.44 * math.sin(x / 8 + y / 11) + 0.12 * math.cos(y / 4 - x / 10) + ripples


width, depth, divisions = 58, 49, 150
vertices = []
for row in range(divisions + 1):
    for column in range(divisions + 1):
        x = width * (column / divisions - 0.5)
        y = depth * (row / divisions - 0.5)
        vertices.append((x, y, height(x, y)))
stride = divisions + 1
faces = [(j * stride + i, j * stride + i + 1, (j + 1) * stride + i + 1, (j + 1) * stride + i)
         for j in range(divisions) for i in range(divisions)]
ground_mesh = bpy.data.meshes.new("Illustrative cultivated terrain")
ground_mesh.from_pydata(vertices, [], faces)
ground_mesh.update()
uv = ground_mesh.uv_layers.new()
for loop in ground_mesh.loops:
    x, y, _ = ground_mesh.vertices[loop.vertex_index].co
    uv.data[loop.index].uv = (x / 2.0, y / 2.0)
for polygon in ground_mesh.polygons:
    polygon.use_smooth = True
ground = bpy.data.objects.new("Illustrative ground", ground_mesh)
bpy.context.collection.objects.link(ground)
ground_mesh.materials.append(soil_material())

rng = random.Random(103)
active_only(ground)
rows = bpy.data.objects.new("Wheat rows", None)
bpy.context.collection.objects.link(rows)
rows.select_set(True)
plants = []
for row in range(36):
    for column in range(52):
        x = -16.3 + column * 0.64 + rng.uniform(-0.18, 0.18)
        y = -11.7 + row * 0.64 + 0.72 * math.sin(x / 7) + rng.uniform(-0.13, 0.13)
        if rng.random() < 0.04 or abs(y + 1.1 + 0.07 * x) < 0.62:
            continue
        plant = wheat.copy()
        bpy.context.collection.objects.link(plant)
        plant.parent = rows
        plant.location = (x, y, height(x, y) - 0.035)
        plant.rotation_euler.z = rng.uniform(-math.pi, math.pi)
        plant.rotation_euler.x = rng.gauss(0.035, 0.05)
        plant.rotation_euler.y = rng.gauss(-0.07, 0.05)
        plant.scale = (rng.uniform(1.22, 1.65), rng.uniform(1.22, 1.65), rng.uniform(0.82, 1.16))
        plant.select_set(True)
        plants.append(plant)
bpy.data.objects.remove(wheat, do_unlink=True)

# Keep the detailed tree and high-resolution plant geometry in the authoring scene.
export(PUBLIC / "spatial-field-study.glb")
for plant in plants:
    plant.data = detail_mesh
nodes = ground_mesh.materials[0].node_tree.nodes
links = ground_mesh.materials[0].node_tree.links
shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
normal = next(node for node in nodes if node.type == "NORMAL_MAP")
noise = nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value = 430
noise.inputs["Detail"].default_value = 3.5
bump = nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.39
bump.inputs["Distance"].default_value = 0.10
links.new(noise.outputs["Fac"], bump.inputs["Height"])
links.new(normal.outputs["Normal"], bump.inputs["Normal"])
links.new(bump.outputs["Normal"], shader.inputs["Normal"])
tree_path = SOURCE / "tree/tree.gltf"
if tree_path.is_file() and (tree_path.parent / "tree_small_02.bin").is_file():
    bpy.ops.import_scene.gltf(filepath=str(tree_path))
    tree = next(obj for obj in bpy.context.selected_objects if obj.type == "MESH")
    tree.location = (-13.6, 8.5, height(-13.6, 8.5))
    tree.scale = (0.64, 0.64, 0.64)
    for x, y, scale in ((-22, 12, 1.2), (-18, 16, 0.76), (-6, 18, 0.89), (3, 17.5, 1.08), (10, 20, 0.82)):
        landmark = tree.copy()
        bpy.context.collection.objects.link(landmark)
        landmark.location = (x, y, height(x, y))
        landmark.rotation_euler.z += rng.uniform(-math.pi, math.pi)
        landmark.scale = (scale, scale, scale)

scene = bpy.context.scene
scene.world = bpy.data.worlds.new("Farm daylight")
scene.world.use_nodes = True
nodes = scene.world.node_tree.nodes
environment = nodes.new("ShaderNodeTexEnvironment")
environment.image = bpy.data.images.load(str(SOURCE / "farm-field.hdr"))
environment.image.pack()
background = nodes.get("Background")
background.inputs["Strength"].default_value = 0.55
scene.world.node_tree.links.new(environment.outputs["Color"], background.inputs["Color"])
sun = bpy.data.lights.new("Late afternoon key", "SUN")
sun.energy, sun.angle = 2.6, math.radians(4)
sun.color = (1.0, 0.91, 0.76)
sun_object = bpy.data.objects.new("Late afternoon key", sun)
bpy.context.collection.objects.link(sun_object)
sun_object.rotation_euler = (0.59, -0.88, -0.67)
camera = bpy.data.objects.new("Field study camera", bpy.data.cameras.new("Field study camera"))
bpy.context.collection.objects.link(camera)
scene.camera = camera
camera.location = (12.4, -13.3, 5.1)
camera.rotation_euler = (Vector((-3.2, 1.6, 0.9)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.lens = 43
detail = bpy.data.objects.new("Crop-height detail camera", bpy.data.cameras.new("Crop-height detail camera"))
bpy.context.collection.objects.link(detail)
detail.location = (-2.7, -4.7, height(-2.7, -4.7) + 0.84)
detail.rotation_euler = (Vector((1.0, 0.3, height(1.0, 0.3) + 0.42)) - detail.location).to_track_quat("-Z", "Y").to_euler()
detail.data.lens = 54
detail.data.dof.use_dof = True
detail.data.dof.focus_distance = 2.6
detail.data.dof.aperture_fstop = 4.0
scene.render.engine = "CYCLES"
scene.cycles.samples = 28
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1200, 750
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str((OUT / "agromax-tarla-etudu.blend").resolve()), compress=True)
for label, view in (("tarla-genel", camera), ("basak-yakin", detail)):
    scene.camera = view
    scene.render.filepath = str((OUT / (label + ".png")).resolve())
    bpy.ops.render.render(write_still=True)

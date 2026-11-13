# Vorschaubilder einer KI-Datei: blender -b --python ki_vorschau.py -- <datei.glb> <ausgabe-präfix> <frames 1,20> [aktion]
import bpy, sys, math
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
for o in list(bpy.data.objects):
    if o.name.startswith('Icosphere'):
        bpy.data.objects.remove(o)
sc = bpy.context.scene
try:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError:
    sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = sc.render.resolution_y = 700
sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.25, 0.25, 0.27, 1)
sc.world.node_tree.nodes['Background'].inputs[1].default_value = 1.2
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam)
sc.camera = cam
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
if len(argv) > 3:
    act = next(a for a in bpy.data.actions if a.name.startswith(argv[3]))
    if arm.animation_data:
        for t in arm.animation_data.nla_tracks:
            t.mute = True
    arm.animation_data_create().action = act
hoehe = max(o.dimensions.z for o in bpy.data.objects if o.type == 'MESH')
for fr in [int(f) for f in argv[2].split(',')]:
    sc.frame_set(fr)
    for ang, tag in [(-35, 'a'), (145, 'b')]:
        r = 2.2 * hoehe
        a = math.radians(ang)
        cam.location = (r * math.sin(a), -r * math.cos(a), hoehe * 1.2)
        d = cam.location.copy()
        d.z -= hoehe * 0.5
        cam.rotation_euler = (math.atan2(math.hypot(d.x, d.y), d.z), 0, math.atan2(d.y, d.x) + math.pi / 2)
        sc.render.filepath = f"{argv[1]}_{fr}{tag}.png"
        bpy.ops.render.render(write_still=True)

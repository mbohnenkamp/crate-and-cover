# Aufbau einer KI-Datei auslesen: blender -b --python ki_info.py -- <datei.glb>
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
for o in bpy.data.objects:
    if o.name.startswith('Icosphere'):
        continue
    info = [o.name, o.type, tuple(round(v, 3) for v in o.dimensions)]
    if o.type == 'MESH':
        info += [len(o.data.polygons)]
    if o.type == 'ARMATURE':
        info += [len(o.data.bones)]
    print('INFO', info)
for a in bpy.data.actions:
    print('INFO Aktion', a.name, tuple(round(v) for v in a.frame_range))

# Wie schnell läuft eine Lauf-Animation von sich aus? Misst, wie schnell der aufgesetzte Fuß nach hinten gleitet
# (Meter pro Sekunde). Aufruf: blender -b --python ki_schritt.py -- <datei.glb> [aktion]
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
if len(argv) > 1:
    act = next(a for a in bpy.data.actions if a.name.startswith(argv[1]))
    if arm.animation_data:
        for t in arm.animation_data.nla_tracks:
            t.mute = True
    arm.animation_data_create().action = act
act = arm.animation_data.action
sc = bpy.context.scene
fps = sc.render.fps / sc.render.fps_base
f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
werte = []
for fuss in ['LeftFoot', 'RightFoot']:
    pos = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        p = arm.matrix_world @ arm.pose.bones[fuss].head
        pos.append(p)
    tief = min(p.z for p in pos)
    # Bodenkontakt: Fuß nahe am tiefsten Punkt
    for a, b in zip(pos, pos[1:]):
        if a.z < tief + 0.03 and b.z < tief + 0.03:
            werte.append(abs(b.y - a.y) * fps)
werte.sort()
print('SCHRITT', act.name, 'fps', fps, 'Frames', f0, f1, 'Dauer', round((f1 - f0) / fps, 2), 's',
      'Fußgleiten m/s Median', round(werte[len(werte) // 2], 2) if werte else None)

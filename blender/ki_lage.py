# Wo sitzen Kopf und Hüfte je Bewegung, gemessen am Fußpunkt der Figur? Zum Abgleich mit den Trefferzonen
# (game/hitbox.js). Blender: vorn ist -Y, oben +Z. Aufruf: blender -b --python ki_lage.py -- <datei.glb>
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
sc = bpy.context.scene
for t in arm.animation_data.nla_tracks:
    t.mute = True
for act in bpy.data.actions:
    arm.animation_data.action = act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    rows = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        h = arm.matrix_world @ arm.pose.bones['Head'].head
        top = arm.matrix_world @ arm.pose.bones['head_end'].head
        hip = arm.matrix_world @ arm.pose.bones['Hips'].head
        rows.append((-(h.y + top.y) / 2, (h.x + top.x) / 2, top.z, -hip.y, hip.z))
    n = len(rows)
    mid = lambda i: sum(r[i] for r in rows) / n
    print('MESS', act.name, 'Bilder', n, 'Dauer', round((f1 - f0) / 24, 2),
          '| Kopf vor', round(mid(0), 2), 'min', round(min(r[0] for r in rows), 2), 'max', round(max(r[0] for r in rows), 2),
          '| Kopf seitlich', round(mid(1), 2), '| Scheitel', round(mid(2), 2),
          '| Hüfte vor', round(mid(3), 2), '| Hüfthöhe', round(mid(4), 2))

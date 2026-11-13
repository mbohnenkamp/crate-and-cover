# KI-Figur zusammenbauen: Grundmodell mit eigenem Skelett, weitere Animationen aus anderen Meshy-Dateien
# über die Weltlage der Knochen übertragen (gleich benannte Skelette, auch von anderen Figuren; die Hüfte bewegt sich
# mit, alle anderen Knochen übernehmen nur die Drehung),
# Die Waffe hängt das Spiel an die Figur. Übernommen aus dem Dungeon Crawler. Aufruf:
# blender -b --python ki_kombinieren.py -- <basis.glb> <basis-clipname> <ziel.glb> <name>=<datei.glb> ...
import bpy, sys, mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
basis, basis_name, ziel = argv[0], argv[1], argv[2]
clips = [a.split('=', 1) for a in argv[3:]]
TEXTUR = 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def importieren(pfad):
    vorher = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=pfad)
    neu = [o for o in bpy.data.objects if o not in vorher]
    for o in [o for o in neu if o.name.startswith('Icosphere')]:
        neu.remove(o)
        bpy.data.objects.remove(o)
    return next(o for o in neu if o.type == 'ARMATURE'), [o for o in neu if o.type == 'MESH']


arm, meshes = importieren(basis)
arm.name = 'skelett'
for m in meshes:
    m.name = 'skelett_koerper'
act = arm.animation_data.action
act.name = basis_name
ordnung = []
def sammeln(b):
    ordnung.append(b.name)
    for c in b.children:
        sammeln(c)
for b in arm.data.bones:
    if not b.parent:
        sammeln(b)
rest_a = {b.name: b.matrix_local.copy() for b in arm.data.bones}

for name, pfad in clips:
    quelle, q_meshes = importieren(pfad)
    rest_b = {b.name: b.matrix_local.copy() for b in quelle.data.bones}
    versatz = {n: rest_b[n].inverted() @ rest_a[n] for n in ordnung if n in rest_b}
    q_act = quelle.animation_data.action
    start, ende = int(round(q_act.frame_range[0])), int(round(q_act.frame_range[1]))
    neu = bpy.data.actions.new(name)
    arm.animation_data.action = neu
    for f in range(start, ende + 1):
        sc.frame_set(f)
        for n in ordnung:
            if n not in versatz:
                continue
            pb = arm.pose.bones[n]
            ziel_m = quelle.pose.bones[n].matrix @ versatz[n]
            if pb.parent:
                # Nur die Drehung übernehmen, Lage ergibt sich aus den eigenen Knochenlängen
                pb.location = (0, 0, 0)
                bpy.context.view_layer.update()
                ziel_m = mathutils.Matrix.LocRotScale(pb.matrix.to_translation(), ziel_m.to_quaternion(), None)
            pb.matrix = ziel_m
            bpy.context.view_layer.update()
        for n in ordnung:
            pb = arm.pose.bones[n]
            pb.keyframe_insert('rotation_quaternion', frame=f)
            pb.keyframe_insert('location', frame=f)
    for o in [quelle, *q_meshes]:
        bpy.data.objects.remove(o)
    bpy.data.actions.remove(q_act)

# Alle Animationen als NLA-Spuren, damit der Export sie mitnimmt
arm.animation_data.action = None
for spur in list(arm.animation_data.nla_tracks):
    arm.animation_data.nla_tracks.remove(spur)
for a in [a for a in bpy.data.actions if '|' not in a.name]:
    spur = arm.animation_data.nla_tracks.new()
    spur.name = a.name
    spur.strips.new(a.name, int(a.frame_range[0]), a)
    spur.mute = True

# Textur verkleinern: Sie macht den größten Teil der Datei aus (2048 px ≈ 3,6 MB, 1024 px deutlich weniger)
for img in bpy.data.images:
    if img.size[0] > TEXTUR:
        img.scale(TEXTUR, TEXTUR)

# Nur Skelett und Körper exportieren
for o in list(bpy.data.objects):
    if o not in (arm, *meshes):
        bpy.data.objects.remove(o)
bpy.ops.export_scene.gltf(filepath=ziel, export_format='GLB', export_animation_mode='NLA_TRACKS',
                          export_yup=True, export_apply=False, export_image_format='JPEG', export_jpeg_quality=85)
print('FERTIG', ziel, [a.name for a in bpy.data.actions])

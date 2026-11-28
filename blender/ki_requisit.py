# Großes KI-Requisit (Kran, Bagger …) aus Meshy auf Maße bringen: um die Hochachse drehen, je Achse auf Zielgröße
# strecken, Ursprung unten in die Mitte, Textur verkleinern, exportieren. Maße in Spielmetern: x quer, y hoch,
# z Tiefe (im Spiel ist vorn −Z). Ohne Zielgröße nur messen: Hüllquader und Fußpunkte (Punkte bis 0,3 m über dem
# Boden, in Gruppen), damit man sieht, wo Beine und Ketten stehen.
# Aufruf: blender -b --python ki_requisit.py -- <roh.glb> [<ziel.glb> <drehung Grad> <x,y,z>] [textur=1024]
import bpy, sys, math, mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
roh = argv[0]
messen = len(argv) < 4
wahl = dict(a.split('=', 1) for a in argv[1:] if '=' in a)
textur = int(wahl.get('textur', 1024))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=roh)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects:
    o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
for o in [o for o in bpy.data.objects if o is not obj]:
    bpy.data.objects.remove(o)
obj.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def punkte():
    # Blender: x quer, y Tiefe, z hoch → Spiel: x, y = Blender z, z = −Blender y
    return [(v.co.x, v.co.z, -v.co.y) for v in obj.data.vertices]


def huelle(p):
    return [min(q[k] for q in p) for k in range(3)], [max(q[k] for q in p) for k in range(3)]


if not messen:
    ziel, drehung = argv[1], math.radians(float(argv[2]))
    groesse = [float(v) for v in argv[3].split(',')]
    obj.data.transform(mathutils.Matrix.Rotation(drehung, 4, 'Z'))
    lo, hi = huelle(punkte())
    s = [groesse[k] / (hi[k] - lo[k]) for k in range(3)]
    mitte = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2]
    # Spiel-Achsen zurück nach Blender (x, −z, y)
    obj.data.transform(mathutils.Matrix.Translation((-mitte[0], mitte[2], -mitte[1])))
    obj.data.transform(mathutils.Matrix.Diagonal((s[0], s[2], s[1], 1)))
    print('STRECKUNG', [round(v, 3) for v in s])

p = punkte()
lo, hi = huelle(p)
print('HUELLE', [round(v, 2) for v in lo], [round(v, 2) for v in hi], 'Punkte', len(p), 'Flächen', len(obj.data.polygons))
# Fußpunkte: Punkte nahe am Boden in ein Raster (0,5 m, beim Messen 1/40 der Höhe), zusammenhängende Zellen als Gruppe
# (beim Messen in Rohmaßen: unterste 3 % der Höhe)
boden = [q for q in p if q[1] < lo[1] + (0.03 * (hi[1] - lo[1]) if messen else 0.3)]
raster = (hi[1] - lo[1]) / 40 if messen else 0.5
zellen = {}
for q in boden:
    zellen.setdefault((round(q[0] / raster), round(q[2] / raster)), []).append(q)
gruppen, offen = [], set(zellen)
while offen:
    start = offen.pop()
    stapel, gruppe = [start], [start]
    while stapel:
        cx, cz = stapel.pop()
        for d in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]:
            n = (cx + d[0], cz + d[1])
            if n in offen:
                offen.remove(n)
                stapel.append(n)
                gruppe.append(n)
    qs = [q for c in gruppe for q in zellen[c]]
    gruppen.append(([round(min(q[0] for q in qs), 2), round(min(q[2] for q in qs), 2)],
                    [round(max(q[0] for q in qs), 2), round(max(q[2] for q in qs), 2)], len(qs)))
for g in sorted(gruppen, key=lambda g: -g[2])[:8]:
    print('FUSS', g[0], g[1], 'Punkte', g[2])

if not messen:
    for img in bpy.data.images:
        if img.size[0] > textur:
            img.scale(textur, textur)
    bpy.ops.export_scene.gltf(filepath=ziel, export_format='GLB', export_yup=True, export_image_format='JPEG',
                              export_jpeg_quality=85)
    print('FERTIG', ziel)

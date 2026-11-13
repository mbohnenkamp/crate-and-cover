# Starres KI-Modell (Waffe, Arm, Requisit) aus Meshy für das Spiel herrichten: drehen, auf Länge bringen, Ursprung
# setzen, Textur verkleinern, exportieren. Im Spiel ist vorn −Z und oben +Y, in Blender also vorn +Y und oben +Z.
# Aufruf: blender -b --python ki_teil.py -- <roh.glb> <ziel.glb> <name> <drehung x,y,z Grad> <länge entlang Y in m>
#         <ursprung als Anteil u,v,w des Hüllquaders> [textur=1024] [vorschau=<präfix>] [spiegeln=<name2>]
#         [strecken=<y>:<faktor>;<y>:<faktor>]
# vorschau: drei Bilder (Seite von +X, oben, vorn), der Ursprung ist rot markiert.
# spiegeln: eine an der Mittelebene gespiegelte Kopie unter name2 kommt dazu (linke Hand aus der rechten).
# strecken: alles hinter y (Meter, vom Ursprung) wird um den Faktor nach hinten gezogen, der Reihe nach
# (Unterarm und Ärmel länger, damit der Arm unten aus dem Bild läuft).
import bpy, sys, math, mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
roh, ziel, name = argv[0], argv[1], argv[2]
drehung = [math.radians(float(v)) for v in argv[3].split(',')]
laenge = float(argv[4])
anteil = [float(v) for v in argv[5].split(',')]
wahl = dict(a.split('=', 1) for a in argv[6:])
textur = int(wahl.get('textur', 1024))
vorschau = wahl.get('vorschau')
spiegel = wahl.get('spiegeln')
strecken = [[float(v) for v in t.split(':')] for t in wahl['strecken'].split(';')] if 'strecken' in wahl else []

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=roh)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects:
    o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
for o in [o for o in bpy.data.objects if o is not ob]:
    bpy.data.objects.remove(o)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
ob.rotation_mode = 'XYZ'  # der Import stellt auf Quaternion, dann greift rotation_euler nicht
ob.rotation_euler = drehung
bpy.ops.object.transform_apply(rotation=True)


def huelle():
    pts = [v.co for v in ob.data.vertices]
    lo = mathutils.Vector([min(p[i] for p in pts) for i in range(3)])
    hi = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


lo, hi = huelle()
k = laenge / (hi.y - lo.y)
ob.scale = (k, k, k)
bpy.ops.object.transform_apply(scale=True)
lo, hi = huelle()
punkt = mathutils.Vector([lo[i] + (hi[i] - lo[i]) * anteil[i] for i in range(3)])
ob.data.transform(mathutils.Matrix.Translation(-punkt))
for grenze, faktor in strecken:
    for v in ob.data.vertices:
        if v.co.y < grenze:
            v.co.y = grenze + (v.co.y - grenze) * faktor
ob.name = name
ob.data.name = name
lo, hi = huelle()
print('TEIL', name, 'Flächen', len(ob.data.polygons), 'Hülle', [round(v, 3) for v in lo], [round(v, 3) for v in hi])

for img in bpy.data.images:
    if img.size[0] > textur:
        img.scale(textur, textur)
for m in ob.data.materials:
    m.name = name

if spiegel:
    kopie = ob.copy()
    kopie.data = ob.data.copy()
    kopie.name = spiegel
    kopie.data.name = spiegel
    sc.collection.objects.link(kopie)
    kopie.data.transform(mathutils.Matrix.Scale(-1, 4, (1, 0, 0)))
    kopie.data.flip_normals()

bpy.ops.export_scene.gltf(filepath=ziel, export_format='GLB', export_yup=True, export_apply=True,
                          export_image_format='JPEG', export_jpeg_quality=85, export_animations=False)

if vorschau:
    try:
        sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 900, 600
    sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.52, 1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 1.5
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    sc.collection.objects.link(sun)
    rot = bpy.data.materials.new('rot')
    rot.use_nodes = True
    rot.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 0, 0, 1)
    groesse = max(hi - lo)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=groesse * 0.012, location=(0, 0, 0))
    bpy.context.view_layer.objects.active.data.materials.append(rot)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = groesse * 1.15
    sc.collection.objects.link(cam)
    sc.camera = cam
    mitte = (lo + hi) / 2
    # Seite: rechts im Bild ist vorn (+Y), oben ist oben. Oben: rechts ist +X, oben im Bild ist vorn. Vorn: Blick von vorn.
    for tag, weg, dreh in [('seite', (1, 0, 0), (90, 0, 90)), ('oben', (0, 0, 1), (0, 0, 0)), ('vorn', (0, 1, 0), (90, 0, 180))]:
        cam.location = mitte + mathutils.Vector(weg) * groesse * 3
        cam.rotation_euler = [math.radians(v) for v in dreh]
        sc.render.filepath = f'{vorschau}_{tag}.png'
        bpy.ops.render.render(write_still=True)

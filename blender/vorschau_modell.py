# Vorschau einer Modellszene: vorn, Seite, schräg (Workbench, Materialfarben) als drei Bilder.
# Aufruf: Blender -b blender/modelle.blend -S <Szene> --python blender/vorschau_modell.py -- <Ausgabeordner> <Höhe in m>
import bpy, math, sys
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
out, hoehe = args[0], float(args[1])
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_shadows = True
sc.display.shading.show_object_outline = True
sc.render.resolution_x, sc.render.resolution_y = 700, 700
world = bpy.data.worlds.get('Vorschau') or bpy.data.worlds.new('Vorschau')
world.color = (0.92, 0.92, 0.92)
sc.world = world
cam_data = bpy.data.cameras.new('vorschau_cam')
cam = bpy.data.objects.new('vorschau_cam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
d = hoehe * 2.2
name = sc.name.lower()
ziel = Vector((0, 0, hoehe / 2))
for view, loc, typ in (('vorn', (0, -d, hoehe / 2), 'ORTHO'), ('seite', (d, 0, hoehe / 2), 'ORTHO'), ('schraeg', (d * 0.7, -d * 0.7, hoehe * 1.1), 'PERSP')):
    cam.location = loc
    cam.rotation_euler = (ziel - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam_data.type = typ
    cam_data.ortho_scale = hoehe * 1.3
    cam_data.lens = 50
    sc.render.filepath = f'{out}/{name}_{view}.png'
    bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(cam)
print('VORSCHAU fertig')

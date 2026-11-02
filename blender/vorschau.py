# Aufruf: Blender -b blender/modelle.blend -S Soldat --python blender/vorschau.py -- <Ausgabeordner>
# Vorschau: Szene Soldat von vorn, Seite, hinten (orthografisch, Workbench), nebeneinander in ein Bild
import bpy, math, sys
sc = bpy.data.scenes['Soldat']
bpy.context.window.scene = sc if bpy.context.window else None
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_shadows = False
sc.display.shading.show_object_outline = True
sc.render.resolution_x, sc.render.resolution_y = 600, 1000
sc.render.film_transparent = False
world = bpy.data.worlds.get('Vorschau') or bpy.data.worlds.new('Vorschau')
world.color = (0.92, 0.92, 0.92)
sc.world = world
cam_data = bpy.data.cameras.new('vorschau_cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 2.0
cam = bpy.data.objects.new('vorschau_cam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
out = sys.argv[sys.argv.index('--') + 1]
for name, loc, rot in (('vorn', (0, -5, 0.92), (90, 0, 0)), ('seite', (5, 0, 0.92), (90, 0, 90)), ('hinten', (0, 5, 0.92), (90, 0, 180)), ('schraeg', (3.5, -3.5, 1.9), (75, 0, 45))):
    cam.location = loc
    cam.rotation_euler = [math.radians(a) for a in rot]
    cam_data.type = 'PERSP' if name == 'schraeg' else 'ORTHO'
    cam_data.lens = 70
    sc.render.filepath = f'{out}/soldat_{name}.png'
    bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(cam)

# Aufruf: Blender -b blender/modelle.blend -S Waffen --python blender/waffen_vorschau.py -- <Ausgabeordner>
# Vorschau: jede Waffe von der Seite (orthografisch, Workbench), Mündung nach rechts wie im Entwurf
import bpy, sys
sc = bpy.data.scenes['Waffen']
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_object_outline = True
sc.render.resolution_x, sc.render.resolution_y = 900, 450
world = bpy.data.worlds.get('Vorschau') or bpy.data.worlds.new('Vorschau')
world.color = (0.85, 0.85, 0.85)
sc.world = world
cam_data = bpy.data.cameras.new('vorschau_cam')
cam_data.type = 'ORTHO'
cam = bpy.data.objects.new('vorschau_cam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
out = sys.argv[sys.argv.index('--') + 1]
roots = [o for o in sc.objects if o.type == 'EMPTY']
for root in roots:
    for r in roots:
        for o in [r, *r.children]:
            o.hide_render = r is not root
    ys = [(o.matrix_world @ v.co).y for o in root.children for v in o.data.vertices]
    zs = [(o.matrix_world @ v.co).z for o in root.children for v in o.data.vertices]
    cy, cz = (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2
    cam_data.ortho_scale = max(max(ys) - min(ys), 2 * (max(zs) - min(zs))) * 1.15
    cam.location = (-3, cy, cz)
    cam.rotation_euler = (1.5708, 0, -1.5708)
    sc.render.filepath = f'{out}/{root.name}.png'
    bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(cam)

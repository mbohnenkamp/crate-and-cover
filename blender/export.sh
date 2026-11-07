#!/bin/bash
# Exportiert eine Szene aus blender/modelle.blend als GLB nach public/models/custom/.
# Eigener Durchgang mit -S, damit die Szene aktiv ist (Export aus einer nicht aktiven Szene stürzte am 24.10.2026 ab).
# Aufruf: blender/export.sh <Szene> <dateiname-ohne-endung>   z. B. blender/export.sh Baum baum
set -e
cd "$(dirname "$0")/.."
/Applications/Blender.app/Contents/MacOS/Blender -b blender/modelle.blend -S "$1" --python-expr "
import bpy
bpy.ops.export_scene.gltf(filepath='public/models/custom/$2.glb', export_format='GLB', use_active_scene=True, export_apply=True, export_yup=True)
print('EXPORT', '$2.glb', [o.name for o in bpy.context.scene.objects])
" 2>&1 | grep -E 'EXPORT|Error|error' || true
ls -la "public/models/custom/$2.glb"

# Laubbaum nach entwuerfe/Baum.png — baut Szene "Baum" neu. Achteckiger Stamm 3 m, zwei kurze Äste,
# kantige Krone (Ikosaeder, zweimal unterteilt, 80 Flächen) 3 m breit, Spitze bei 5,3 m. Fußpunkt im Ursprung.
# Bauen:  Blender -b blender/modelle.blend --python blender/baum.py --python-expr "import bpy; bpy.ops.wm.save_mainfile()"
# Export: blender/export.sh Baum baum
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Vector, Matrix
from hilfen import szene, mat, hull, ring, modell, fertig

sc = szene('Baum')
STAMM = mat('baum_stamm', '#6b4a2f')
LAUB = mat('baum_laub', '#4f8a3d')


def build(get):
    # Stamm: unten etwas dicker, oben schmaler
    hull(get(STAMM), ring(0, 0, 0.26, 0) + ring(0, 0, 0.22, 1.8) + ring(0, 0, 0.19, 3.1))
    # Zwei Äste schräg nach oben, nach +X und −X
    for sx in (-1, 1):
        a = get(STAMM)
        hull(a, ring(sx * 0.1, 0, 0.11, 2.3, 6) + ring(sx * 0.55, 0.05, 0.08, 2.75, 6) + ring(sx * 0.9, 0.1, 0.06, 2.95, 6))
    # Krone: Ikosaeder einmal unterteilt, leicht gestaucht, Mitte bei 3,85 m
    bm = get(LAUB)
    r = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.5)
    bmesh.ops.scale(bm, vec=(1, 1, 0.95), verts=r['verts'])
    bmesh.ops.translate(bm, vec=(0, 0, 3.85), verts=r['verts'])


modell(sc, 'baum', build)
fertig(sc, 'Baum')

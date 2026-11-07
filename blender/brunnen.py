# Marktbrunnen nach entwuerfe/Brunnen.png — baut Szene "Brunnen" neu. Achteckiges Becken 3 × 3 m (Seiten
# parallel zu den Achsen), 0,9 m hoch, mit Rand; Wasser in 0,7 m; Säule bis 2,6 m mit Sockel und Kapitell,
# zwei Wasserspeier nach ±X; gestuftes rotes Ziegeldach bis 3,4 m. Mitte im Ursprung.
# Bauen:  Blender -b blender/modelle.blend --python blender/brunnen.py --python-expr "import bpy; bpy.ops.wm.save_mainfile()"
# Export: blender/export.sh Brunnen brunnen
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hilfen import szene, mat, hull, block, ring_a, modell, fertig

sc = szene('Brunnen')
STEIN = mat('brunnen_stein', '#9a958c')
STEIN2 = mat('brunnen_stein_hell', '#aaa59c')
WASSER = mat('brunnen_wasser', '#2f7fd6', 0.2)
METALL = mat('brunnen_metall', '#3c4248')
ZIEGEL = mat('brunnen_ziegel', '#a8382c')


def build(get):
    outer = ring_a(0, 0, 1.5, 0)
    inner = ring_a(0, 0, 1.22, 0)
    # Beckenwand aus acht Segmenten (Außen- und Innenkante je Segment, unten und oben)
    for i in range(8):
        j = (i + 1) % 8
        pts = []
        for z in (0, 0.78):
            for p in (outer[i], outer[j], inner[i], inner[j]):
                pts.append((p[0], p[1], z))
        hull(get(STEIN), pts)
    # Rand oben, etwas breiter, hellerer Stein
    ro = ring_a(0, 0, 1.56, 0)
    ri = ring_a(0, 0, 1.16, 0)
    for i in range(8):
        j = (i + 1) % 8
        pts = []
        for z in (0.78, 0.92):
            for p in (ro[i], ro[j], ri[i], ri[j]):
                pts.append((p[0], p[1], z))
        hull(get(STEIN2), pts)
    # Beckenboden und Wasserfläche
    hull(get(STEIN), ring_a(0, 0, 1.22, 0) + ring_a(0, 0, 1.22, 0.15))
    hull(get(WASSER), ring_a(0, 0, 1.21, 0.15) + ring_a(0, 0, 1.21, 0.62))
    # Säule: Sockel, Schaft, Kapitell
    hull(get(STEIN2), ring_a(0, 0, 0.36, 0.15) + ring_a(0, 0, 0.36, 0.42))
    hull(get(STEIN), ring_a(0, 0, 0.24, 0.42) + ring_a(0, 0, 0.24, 2.5))
    hull(get(STEIN2), ring_a(0, 0, 0.33, 2.5) + ring_a(0, 0, 0.33, 2.62))
    # Wasserspeier nach +X und −X: Rohr aus der Säule, dann nach unten geknickt
    for sx in (-1, 1):
        block(get(METALL), sx * 0.4, 0, 1.28, 1.4, 0.4, 0.1)
        block(get(METALL), sx * 0.62, 0, 1.12, 1.4, 0.1, 0.1)
        block(get(METALL), sx * 0.3, 0, 1.22, 1.46, 0.1, 0.16)  # Flansch an der Säule
    # Dach in drei Stufen, oben eine Spitze
    hull(get(ZIEGEL), ring_a(0, 0, 0.68, 2.62) + ring_a(0, 0, 0.5, 2.88))
    hull(get(ZIEGEL), ring_a(0, 0, 0.55, 2.86) + ring_a(0, 0, 0.36, 3.1))
    hull(get(ZIEGEL), ring_a(0, 0, 0.4, 3.08) + [(0, 0, 3.42)])


modell(sc, 'brunnen', build)
fertig(sc, 'Brunnen')

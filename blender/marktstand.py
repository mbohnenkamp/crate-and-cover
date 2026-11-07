# Marktstand nach entwuerfe/Marktstand.png — baut Szene "Marktstand" neu. Tisch 2,6 × 1,0 m mit Brettern,
# Platte in 0,9–1,0 m, vier Pfosten 0,1 m bei (±1,2, ±0,4) bis 2,3 m, Stoffdach 3,0 × 2,4 m, vorn (−Y) in 2,4 m,
# hinten in 2,05 m, rot-weiß gestreift. Drei Körbe mit Äpfeln und Brot. Mitte des Tisches im Ursprung.
# Das Material marktstand_stoff färbt das Spiel je Stand um (zweiter Stand beige).
# Bauen:  Blender -b blender/modelle.blend --python blender/marktstand.py --python-expr "import bpy; bpy.ops.wm.save_mainfile()"
# Export: blender/export.sh Marktstand marktstand
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from hilfen import szene, mat, hull, block, ring, modell, fertig

sc = szene('Marktstand')
HOLZ = mat('marktstand_holz', '#a8743f')
HOLZ2 = mat('marktstand_holz_dunkel', '#7a5532')
STOFF = mat('marktstand_stoff', '#b33a3a')
STREIFEN = mat('marktstand_streifen', '#efe6d8')
KORB = mat('marktstand_korb', '#c9a46a')
APFEL_ROT = mat('marktstand_apfel_rot', '#c9302c')
APFEL_GRUEN = mat('marktstand_apfel_gruen', '#7fb531')
BROT = mat('marktstand_brot', '#d9933a')


def build(get):
    # Pfosten: vorn bis unters Dach in 2,36 m, hinten bis 2,01 m, oben eine kleine Kappe über dem Dach
    for sx in (-1, 1):
        for sy in (-1, 1):
            top = 2.36 if sy < 0 else 2.01
            block(get(HOLZ2), sx * 1.2, sy * 0.4, 0, top, 0.1, 0.1)
            block(get(HOLZ2), sx * 1.2, sy * 0.4, top + 0.04, top + 0.14, 0.14, 0.14)
    # Tischrahmen und Querstreben unter der Platte, Streben an den Seiten
    for sy in (-1, 1):
        block(get(HOLZ2), 0, sy * 0.42, 0.78, 0.9, 2.5, 0.06)
    for sx in (-1, 1):
        block(get(HOLZ2), sx * 1.2, 0, 0.78, 0.9, 0.06, 0.9)
        block(get(HOLZ2), sx * 1.2, 0, 0.3, 0.36, 0.06, 0.8)
    # Platte aus acht Brettern quer zur langen Seite
    for i in range(8):
        x = -1.3 + 0.325 * (i + 0.5)
        block(get(HOLZ), x, 0, 0.9, 1.0, 0.305, 1.0)
    # Stoffdach: vorn höher, acht Streifen entlang X, abwechselnd Stoff und hell
    for i in range(6):
        x0 = -1.5 + 0.5 * i
        m = get(STOFF if i % 2 == 0 else STREIFEN)
        hull(m, [(x0, -1.2, 2.36), (x0 + 0.5, -1.2, 2.36), (x0, 1.2, 2.01), (x0 + 0.5, 1.2, 2.01),
                 (x0, -1.2, 2.44), (x0 + 0.5, -1.2, 2.44), (x0, 1.2, 2.09), (x0 + 0.5, 1.2, 2.09)])
    # Dachbalken vorn und hinten unter dem Stoff
    block(get(HOLZ2), 0, -0.4, 2.28, 2.36, 2.5, 0.08)
    block(get(HOLZ2), 0, 0.4, 1.93, 2.01, 2.5, 0.08)
    # Drei Körbe: unten schmaler, oben weiter
    for x, inhalt in ((-0.8, 'rot'), (0, 'gruen'), (0.8, 'brot')):
        block(get(KORB), x, 0, 1.0, 1.22, 0.42, 0.34, 0.52, 0.42)
        if inhalt == 'brot':
            for k, (dx, dy) in enumerate(((-0.1, -0.06), (0.1, 0.06))):
                bm = get(BROT)
                hull(bm, ring(x + dx, dy, 0.07, 1.14, 6) + ring(x + dx + 0.2, dy, 0.07, 1.14, 6)
                     + ring(x + dx, dy, 0.05, 1.26, 6) + ring(x + dx + 0.2, dy, 0.05, 1.26, 6))
        else:
            m = get(APFEL_ROT if inhalt == 'rot' else APFEL_GRUEN)
            for dx, dy in ((-0.12, -0.08), (0.12, -0.08), (0, 0.09), (-0.05, 0.02)):
                r = bmesh.ops.create_icosphere(m, subdivisions=1, radius=0.075)
                bmesh.ops.translate(m, vec=(x + dx, dy, 1.25), verts=r['verts'])


modell(sc, 'marktstand', build)
fertig(sc, 'Marktstand')

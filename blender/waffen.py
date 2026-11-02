# Waffen nach entwuerfe/Waffen.webp — baut Szene "Waffen" neu: waffe_gewehr, waffe_pistole, waffe_messer, waffe_scharf.
# Maße aus der Seitenansicht abgenommen (Pixel im Entwurf mal Maßstab je Waffe). Mündung zeigt nach +Y
# (im Spiel −Z), oben ist +Z, Ursprung oben am Griff, wo die Hand sitzt.
import bpy, bmesh, math
from mathutils import Vector

sc = bpy.data.scenes.get('Waffen') or bpy.data.scenes.new('Waffen')
if bpy.context.window:
    bpy.context.window.scene = sc
for o in list(sc.objects):
    bpy.data.objects.remove(o)


def mat(name, hexc, metal=0.0, rough=0.7):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    h = hexc.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    b.inputs['Base Color'].default_value = (*c, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    m.diffuse_color = (*c, 1)
    return m


METALL = mat('waffe_metall', '#3a3d42', 0.3, 0.55)
SCHWARZ = mat('waffe_schwarz', '#1f2124', 0.2, 0.6)
HOLZ = mat('waffe_holz', '#a3602e', 0, 0.8)
OLIV = mat('waffe_oliv', '#56653a', 0, 0.85)
STAHL = mat('waffe_stahl', '#c9ced4', 0.6, 0.35)


def hull(bm, pts):
    vs = [bm.verts.new(p) for p in pts]
    r = bmesh.ops.convex_hull(bm, input=vs)
    dead = {g for g in r['geom_interior'] + r['geom_unused'] if isinstance(g, bmesh.types.BMVert)}
    if dead:
        bmesh.ops.delete(bm, geom=list(dead), context='VERTS')


class Waffe:
    """Baut in Entwurfspixeln: px = waagrecht (nach rechts = Mündung), py = senkrecht (nach unten)."""

    def __init__(self, name, scale, ox, oy):
        self.name, self.s, self.ox, self.oy = name, scale, ox, oy
        self.meshes = {}

    def bm(self, m):
        return self.meshes.setdefault(m, bmesh.new())

    def p(self, px, py, x=0.0):
        return Vector((x, (px - self.ox) * self.s, (self.oy - py) * self.s))

    # Querschnitt als Rechteck: Liste von (px, py_oben, py_unten) entlang der Waffe, Breite w in Metern
    def profile(self, m, stations, w, w_end=None):
        w_end = w if w_end is None else w_end
        pts = []
        for i, (px, top, bottom) in enumerate(stations):
            ww = w + (w_end - w) * i / max(1, len(stations) - 1)
            for py in (top, bottom):
                for sx in (-1, 1):
                    pts.append(self.p(px, py, sx * ww / 2))
        hull(self.bm(m), pts)

    def box(self, m, x0, x1, top, bottom, w):
        self.profile(m, [(x0, top, bottom), (x1, top, bottom)], w)

    # Achteckiges Rohr entlang der Waffe, Mitte bei py, Durchmesser in Pixeln
    def tube(self, m, x0, x1, py, d0, d1=None, n=8):
        d1 = d0 if d1 is None else d1
        pts = []
        for px, d in ((x0, d0), (x1, d1)):
            r = d * self.s / 2
            c = self.p(px, py)
            for i in range(n):
                a = math.pi / n + i * 2 * math.pi / n
                pts.append(c + Vector((math.cos(a) * r, 0, math.sin(a) * r)))
        hull(self.bm(m), pts)

    def finish(self):
        root = bpy.data.objects.new(f'waffe_{self.name}', None)
        sc.collection.objects.link(root)
        for m, bm in self.meshes.items():
            me = bpy.data.meshes.new(f'waffe_{self.name}_{m.name.split("_")[1]}')
            bm.to_mesh(me)
            bm.free()
            for poly in me.polygons:
                poly.use_smooth = False
            me.materials.append(m)
            o = bpy.data.objects.new(me.name, me)
            sc.collection.objects.link(o)
            o.parent = root
        return root


# Sturmgewehr: 800 px = 0,86 m, Ursprung am Griff oben, Mitte des Gehäuses
g = Waffe('gewehr', 0.86 / 800, 300, 160)
g.box(SCHWARZ, 50, 68, 112, 246, 0.046)  # Schaftkappe
g.profile(HOLZ, [(68, 114, 244), (262, 142, 184)], 0.044, 0.04)  # Schaft
g.box(METALL, 260, 492, 118, 200, 0.05)  # Gehäuse
g.box(SCHWARZ, 395, 470, 134, 146, 0.052)  # Auswurf
g.box(METALL, 310, 332, 98, 120, 0.03)  # Kimme
g.box(SCHWARZ, 492, 582, 112, 150, 0.05)  # Handschutz oben, dunkel
g.box(HOLZ, 582, 664, 120, 150, 0.048)  # Handschutz oben, Holz
g.box(HOLZ, 492, 664, 148, 200, 0.056)  # Handschutz unten
g.tube(METALL, 664, 790, 152, 20)  # Lauf
g.tube(METALL, 664, 760, 130, 14)  # Gasrohr
g.box(METALL, 680, 700, 125, 168, 0.03)  # Gasblock
g.box(METALL, 742, 758, 96, 140, 0.016)  # Korn
g.tube(SCHWARZ, 790, 850, 155, 30)  # Mündungsbremse
# Magazin, nach vorn gebogen: Abschnitte von oben nach unten, je vordere und hintere Kante
mag = [((400, 200), (446, 200)), ((403, 250), (452, 248)), ((411, 295), (463, 290)), ((425, 336), (480, 326))]
for (a0, a1), (b0, b1) in zip(mag, mag[1:]):
    hull(g.bm(SCHWARZ), [g.p(px, py, sx * 0.02) for px, py in (a0, a1, b0, b1) for sx in (-1, 1)])
g.profile(SCHWARZ, [(282, 198, 200), (332, 198, 200), (252, 290, 296), (300, 292, 296)], 0.04)  # Pistolengriff
g.box(SCHWARZ, 322, 388, 218, 226, 0.02)  # Abzugsbügel
g.box(SCHWARZ, 380, 388, 200, 226, 0.02)
g.box(SCHWARZ, 338, 345, 200, 216, 0.008)  # Abzug
g.finish()

# Pistole: 275 px = 0,19 m, Ursprung oben am Griff
p = Waffe('pistole', 0.19 / 275, 1110, 160)
p.box(SCHWARZ, 1065, 1325, 122, 186, 0.03)  # Schlitten
p.box(METALL, 1078, 1110, 128, 168, 0.032)  # Griffrillen
p.box(SCHWARZ, 1298, 1312, 115, 124, 0.008)  # Korn
p.box(SCHWARZ, 1070, 1084, 115, 124, 0.02)  # Kimme
p.box(METALL, 1095, 1310, 184, 206, 0.028)  # Rahmen
p.profile(METALL, [(1080, 200, 200), (1162, 200, 200), (1052, 296, 296), (1138, 296, 296)], 0.03)  # Griff
p.profile(SCHWARZ, [(1086, 220, 220), (1150, 220, 220), (1062, 290, 290), (1130, 290, 290)], 0.032)  # Griffschalen
p.box(SCHWARZ, 1058, 1140, 294, 308, 0.03)  # Magazinboden
p.box(SCHWARZ, 1158, 1228, 214, 222, 0.018)  # Abzugsbügel
p.box(SCHWARZ, 1218, 1228, 200, 222, 0.018)
p.box(SCHWARZ, 1178, 1186, 200, 214, 0.006)  # Abzug
p.finish()

# Messer: 445 px = 0,30 m, Ursprung in der Griffmitte
k = Waffe('messer', 0.30 / 445, 160, 692)
k.tube(SCHWARZ, 65, 90, 692, 50, 46)  # Knauf
for x0, x1, d0, d1 in ((90, 120, 38, 42), (120, 200, 42, 44), (200, 236, 44, 38)):
    k.tube(SCHWARZ, x0, x1, 692, d0, d1)  # Griff mit Rillen
for x in (120, 155, 190):
    k.tube(SCHWARZ, x - 3, x + 3, 692, 48)
k.box(SCHWARZ, 236, 250, 642, 742, 0.022)  # Parierstange
blade = k.bm(STAHL)
hull(blade, [k.p(250, 684, sx * 0.003) for sx in (-1, 1)] + [k.p(440, 684, sx * 0.003) for sx in (-1, 1)]
     + [k.p(250, 720, sx * 0.0008) for sx in (-1, 1)] + [k.p(440, 720, sx * 0.0008) for sx in (-1, 1)]
     + [k.p(510, 692)])
k.finish()

# Scharfschützengewehr: 887 px = 1,12 m, Ursprung oben am Griff
s = Waffe('scharf', 1.12 / 887, 860, 680)
s.box(SCHWARZ, 608, 630, 662, 778, 0.05)  # Schaftkappe
s.box(OLIV, 630, 700, 662, 778, 0.05)  # Schaft hinten
s.profile(OLIV, [(700, 662, 778), (712, 662, 740), (800, 662, 706)], 0.05)  # Schaftrücken
s.profile(OLIV, [(790, 700, 700), (862, 700, 700), (768, 772, 772), (826, 772, 772)], 0.045)  # Griff
s.profile(OLIV, [(845, 662, 714), (960, 662, 702), (1220, 662, 700)], 0.052, 0.046)  # Vorderschaft
s.box(SCHWARZ, 846, 1010, 650, 664, 0.04)  # Gehäuse oben
s.tube(SCHWARZ, 1010, 1440, 660, 18, 14)  # Lauf
s.tube(SCHWARZ, 1440, 1495, 656, 30)  # Mündungsbremse
s.box(SCHWARZ, 930, 970, 700, 742, 0.036)  # Magazin
s.box(SCHWARZ, 846, 900, 734, 742, 0.016)  # Abzugsbügel
s.box(SCHWARZ, 864, 870, 712, 734, 0.006)  # Abzug
s.profile(METALL, [(900, 662, 668), (884, 684, 690)], 0.012)  # Kammerstängel
s.tube(METALL, 878, 892, 690, 22)  # Kammerknopf
s.tube(SCHWARZ, 830, 880, 602, 38, 34)  # Okular
s.tube(SCHWARZ, 880, 1080, 602, 26)  # Zielfernrohr
s.tube(SCHWARZ, 1080, 1160, 602, 30, 42)  # Objektiv
s.box(SCHWARZ, 948, 982, 566, 640, 0.04)  # Turm
s.box(SCHWARZ, 905, 925, 600, 654, 0.03)  # Montageringe
s.box(SCHWARZ, 1010, 1030, 600, 654, 0.03)
s.finish()

print('Waffen gebaut:', sorted(o.name for o in sc.objects if o.type == 'EMPTY'))

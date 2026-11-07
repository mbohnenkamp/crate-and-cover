# Gemeinsame Helfer für die Modellskripte: Szene anlegen, Materialien, Blöcke und Hüllen aus bmesh,
# Mesh je Material ablegen. Maße in Metern, Vorderseite −Y (wird im Spiel +Z).
import bpy, bmesh, math
from mathutils import Vector


def szene(name):
    sc = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    if bpy.context.window:
        bpy.context.window.scene = sc
    for o in list(sc.objects):
        data = o.data
        bpy.data.objects.remove(o)
        # Alte Mesh-Daten gleich mit entfernen, sonst heißen die neuen "name.001"
        if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
    return sc


def mat(name, hexc, rough=0.85):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    h = hexc.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    b.inputs['Base Color'].default_value = (*c, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = 0
    m.diffuse_color = (*c, 1)
    return m


def hull(bm, pts):
    vs = [bm.verts.new(Vector(p)) for p in pts]
    r = bmesh.ops.convex_hull(bm, input=vs)
    dead = {g for g in r['geom_interior'] + r['geom_unused'] if isinstance(g, bmesh.types.BMVert)}
    if dead:
        bmesh.ops.delete(bm, geom=list(dead), context='VERTS')


# Quader: Mitte (cx, cy), von z0 bis z1, unten w0 × d0, oben w1 × d1 (x × y), Oberseite um off1 verschoben
def block(bm, cx, cy, z0, z1, w0, d0, w1=None, d1=None, off1=(0, 0)):
    w1 = w0 if w1 is None else w1
    d1 = d0 if d1 is None else d1
    pts = []
    for z, w, d, (ox, oy) in ((z0, w0, d0, (0, 0)), (z1, w1, d1, off1)):
        for sx in (-1, 1):
            for sy in (-1, 1):
                pts.append((cx + ox + sx * w / 2, cy + oy + sy * d / 2, z))
    hull(bm, pts)


# Regelmäßiges n-Eck in Höhe z, Radius r (Eckpunkte), um rot gedreht
def ring(cx, cy, r, z, n=8, rot=math.pi / 8):
    return [(cx + r * math.cos(rot + i * 2 * math.pi / n), cy + r * math.sin(rot + i * 2 * math.pi / n), z) for i in range(n)]


# n-Eck mit Abstand a von der Mitte zu den Seiten (Apothem), Seiten liegen parallel zu den Achsen
def ring_a(cx, cy, a, z, n=8):
    return ring(cx, cy, a / math.cos(math.pi / n), z, n, math.pi / n)


# Glied: achteckige Röhre von (x, y, z0) bis (x, y, z1), unten Radius r0, oben r1 (rx/ry getrennt möglich)
def limb(bm, cx, cy, z0, z1, r0, r1=None, ry0=None, ry1=None):
    r1 = r0 if r1 is None else r1
    ry0 = r0 if ry0 is None else ry0
    ry1 = r1 if ry1 is None else ry1
    pts = []
    for z, rx, ry in ((z0, r0, ry0), (z1, r1, ry1)):
        pts += [(cx + rx * math.cos(math.pi / 8 + i * math.pi / 4), cy + ry * math.sin(math.pi / 8 + i * math.pi / 4), z) for i in range(8)]
    hull(bm, pts)


# Gelenkkugel (Ikosaeder, einmal unterteilt)
def joint(bm, cx, cy, cz, r):
    res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    bmesh.ops.translate(bm, vec=(cx, cy, cz), verts=res['verts'])


# Hand, locker greifend, in Ruhelage hängend: Handgelenk im Ursprung, Finger zeigen nach −Z (unten) und krümmen
# sich nach −Y (vorn), Handrücken zeigt nach +Y. sx = −1 rechte Hand (Daumen innen bei +X), +1 linke Hand.
# place(p) setzt jeden Punkt an seinen Platz (verschieben, drehen).
def hand(bm, sx, scale, place):
    s = scale
    P = lambda x, y, z: place((x * s, y * s, z * s))
    # Handfläche: 8 cm breit, 3 cm dick, 9 cm lang, unten etwas dünner
    hull(bm, [P(a * 0.04, b, c) for a in (-1, 1) for b, c in ((0.015, 0), (-0.015, 0), (0.012, -0.09), (-0.015, -0.09))])
    for i in range(4):
        fx = -0.03 + i * 0.02
        w = 0.008
        # Grundglied nach unten, leicht nach vorn; Endglied nach vorn gekrümmt
        hull(bm, [P(fx + a * w, b, c) for a in (-1, 1) for b, c in ((0.012, -0.085), (-0.012, -0.085), (0.0, -0.125), (-0.024, -0.12))])
        hull(bm, [P(fx + a * w, b, c) for a in (-1, 1) for b, c in ((0.0, -0.125), (-0.024, -0.12), (-0.03, -0.15), (-0.05, -0.14))])
    # Daumen innen: Basis am Handrand, Spitze nach vorn
    tx = -sx * 0.045
    hull(bm, [P(tx + a * 0.01, b, c) for a in (-1, 1) for b, c in ((0.01, -0.02), (-0.01, -0.02), (-0.03, -0.06), (-0.05, -0.05))])


# Legt je Material ein Mesh unter dem Wurzelknoten ab. build(get) baut mit get(material) -> bmesh.
def modell(sc, name, build):
    root = bpy.data.objects.new(name, None)
    sc.collection.objects.link(root)
    meshes = {}
    build(lambda m: meshes.setdefault(m, bmesh.new()))
    for m, bm in meshes.items():
        me = bpy.data.meshes.new(f'{name}_{m.name.split("_", 1)[1]}')
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = False
        me.materials.append(m)
        o = bpy.data.objects.new(me.name, me)
        sc.collection.objects.link(o)
        o.parent = root
    return root


def fertig(sc, name):
    print(f'{name} gebaut:', len([o for o in sc.objects if o.type == 'MESH']), 'Meshes, Szenen:', [s.name for s in bpy.data.scenes])

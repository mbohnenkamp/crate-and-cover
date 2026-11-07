# Soldat nach entwuerfe/Soldat.png — baut Szene "Soldat" neu. Vorderseite −Y, Maße in Metern, 1,80 m groß.
# Bewegliche Teile als eigene Knoten mit Drehpunkt (Hüfte, Hals, Schultern, Knie), damit das Spiel Laufen,
# Knien und Zielen zeigen kann: soldat_rumpf (trägt soldat_kopf, soldat_arm_l/r), soldat_bein_l/r (Oberschenkel)
# mit soldat_unterbein_l/r.
# Das Material soldat_team färbt das Spiel je Team um.
import bpy, bmesh, math
from mathutils import Vector

sc = bpy.data.scenes.get('Soldat') or bpy.data.scenes.new('Soldat')
if bpy.context.window:
    bpy.context.window.scene = sc
for o in list(sc.objects):
    bpy.data.objects.remove(o)


def mat(name, hexc):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    h = hexc.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    b.inputs['Base Color'].default_value = (*c, 1)
    b.inputs['Roughness'].default_value = 0.85
    b.inputs['Metallic'].default_value = 0
    m.diffuse_color = (*c, 1)
    return m


TEAM = mat('soldat_team', '#3d7bd9')
STOFF = mat('soldat_stoff', '#4a4d53')
DUNKEL = mat('soldat_dunkel', '#2c2e33')
SCHWARZ = mat('soldat_schwarz', '#17181a')
HAUT = mat('soldat_haut', '#d9c2a5')
GLAS = mat('soldat_brille', '#101214')


def hull(bm, pts):
    vs = [bm.verts.new(p) for p in pts]
    r = bmesh.ops.convex_hull(bm, input=vs)
    dead = {g for g in r['geom_interior'] + r['geom_unused'] if isinstance(g, bmesh.types.BMVert)}
    if dead:
        bmesh.ops.delete(bm, geom=list(dead), context='VERTS')


# Quader mit unten/oben verschiedenen Maßen (w = Breite x, d = Tiefe y), Mitte (cx, cy), von z0 bis z1
def block(bm, cx, cy, z0, z1, w0, d0, w1=None, d1=None, off1=(0, 0)):
    w1 = w0 if w1 is None else w1
    d1 = d0 if d1 is None else d1
    pts = []
    for z, w, d, (ox, oy) in ((z0, w0, d0, (0, 0)), (z1, w1, d1, off1)):
        for sx in (-1, 1):
            for sy in (-1, 1):
                pts.append(Vector((cx + ox + sx * w / 2, cy + oy + sy * d / 2, z)))
    hull(bm, pts)


# Achteckiger Ring für Helm und Kopf
def ring(c, rx, ry, z, n=8, rot=math.pi / 8):
    return [Vector((c.x + rx * math.cos(rot + i * 2 * math.pi / n), c.y + ry * math.sin(rot + i * 2 * math.pi / n), z)) for i in range(n)]


def part(name, pivot, parent, build):
    node = bpy.data.objects.new(name, None)
    sc.collection.objects.link(node)
    node.location = Vector(pivot) - parent.matrix_world.translation
    node.parent = parent
    node.matrix_world.translation = pivot
    meshes = {}
    build(lambda m: meshes.setdefault(m, bmesh.new()))
    for m, bm in meshes.items():
        # Geometrie ist in Weltkoordinaten gebaut, relativ zum Drehpunkt ablegen
        bmesh.ops.translate(bm, verts=bm.verts, vec=-Vector(pivot))
        me = bpy.data.meshes.new(f'{name}_{m.name.split("_")[1]}')
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = False
        me.materials.append(m)
        o = bpy.data.objects.new(me.name, me)
        sc.collection.objects.link(o)
        o.parent = node
    return node


root = bpy.data.objects.new('soldat', None)
sc.collection.objects.link(root)


def rumpf(get):
    # Becken und Gürtel
    block(get(STOFF), 0, 0, 0.86, 1.02, 0.36, 0.21, 0.37, 0.21)
    block(get(SCHWARZ), 0, 0, 0.96, 1.04, 0.39, 0.23)
    block(get(DUNKEL), 0, -0.118, 0.965, 1.035, 0.09, 0.02)  # Schnalle
    # Oberkörper: unten schmaler, Schultern breit
    block(get(STOFF), 0, 0, 1.02, 1.40, 0.34, 0.20, 0.44, 0.22)
    block(get(STOFF), 0, 0, 1.40, 1.44, 0.44, 0.22, 0.36, 0.18)
    # Weste vorn und hinten, Schulterträger
    block(get(TEAM), 0, -0.005, 1.08, 1.37, 0.40, 0.27, 0.41, 0.27)
    for sx in (-1, 1):
        block(get(TEAM), sx * 0.13, 0, 1.36, 1.445, 0.09, 0.27, 0.08, 0.22)
    # Drei Taschen vorn, darüber eine Klappe
    for x in (-0.12, 0, 0.12):
        block(get(TEAM), x, -0.15, 1.10, 1.24, 0.105, 0.05, 0.105, 0.05)
        block(get(DUNKEL), x, -0.176, 1.205, 1.24, 0.09, 0.008)
    # Rückenplatte mit Querriemen
    block(get(DUNKEL), 0, 0.137, 1.16, 1.18, 0.38, 0.006)
    block(get(DUNKEL), 0, 0.137, 1.24, 1.26, 0.38, 0.006)
    # Halstuch
    block(get(DUNKEL), 0, 0, 1.42, 1.51, 0.19, 0.17, 0.15, 0.14)


def kopf(get):
    # Kopf: Kinn schmaler, Hinterkopf rund
    c = Vector((0, 0.005, 0))
    hull(get(HAUT), ring(c, 0.075, 0.085, 1.50) + ring(c, 0.098, 0.11, 1.58) + ring(c, 0.1, 0.11, 1.70))
    block(get(HAUT), 0, -0.105, 1.57, 1.62, 0.03, 0.03)  # Nase
    # Schutzbrille mit Band
    block(get(GLAS), 0, -0.1, 1.615, 1.665, 0.2, 0.03, 0.21, 0.03)
    hull(get(SCHWARZ), ring(c, 0.104, 0.114, 1.62) + ring(c, 0.104, 0.114, 1.645))
    # Gehörschutz
    for sx in (-1, 1):
        block(get(DUNKEL), sx * 0.112, 0.01, 1.55, 1.64, 0.04, 0.09)
    # Kinnriemen
    for sx in (-1, 1):
        block(get(SCHWARZ), sx * 0.085, 0.0, 1.52, 1.66, 0.012, 0.02)
    # Helm: Rand, Kuppel
    h = get(TEAM)
    hull(h, ring(c, 0.15, 0.165, 1.66) + ring(c, 0.155, 0.17, 1.70) + ring(c, 0.14, 0.155, 1.76) + ring(c, 0.09, 0.1, 1.815))
    hull(get(DUNKEL), ring(c, 0.157, 0.172, 1.655) + ring(c, 0.157, 0.172, 1.672))  # dunkler Rand
    for sx in (-1, 1):
        block(get(DUNKEL), sx * 0.15, -0.02, 1.68, 1.71, 0.02, 0.07)  # Schienen am Helm


def arm(sx):
    def build(get):
        x = sx * 0.25
        # Oberarm mit Schulter, bis zum Ellbogen in 1,10 m
        block(get(STOFF), x, 0, 1.10, 1.43, 0.12, 0.13, 0.14, 0.15)
        block(get(STOFF), x + sx * 0.005, -0.005, 1.25, 1.34, 0.145, 0.155)  # Tasche am Ärmel
        block(get(DUNKEL), x, 0, 1.10, 1.14, 0.125, 0.135)  # hochgekrempelter Ärmel, obere Hälfte
    return build


# Unterarm ab dem Ellbogen (Drehpunkt 1,10 m): Ärmelrest, Haut, Handschuh, Daumen. Handmitte bei 0,815 m.
def unterarm(sx):
    def build(get):
        x = sx * 0.25
        block(get(DUNKEL), x, 0, 1.06, 1.10, 0.125, 0.135)
        block(get(HAUT), x, 0, 0.88, 1.07, 0.095, 0.1, 0.105, 0.11)
        block(get(SCHWARZ), x, 0, 0.74, 0.89, 0.1, 0.11, 0.11, 0.115)
        block(get(SCHWARZ), x - sx * 0.045, -0.04, 0.79, 0.86, 0.035, 0.04)
    return build


def bein(sx):
    def build(get):
        x = sx * 0.105
        # Oberschenkel, Beintasche außen
        block(get(STOFF), x, 0, 0.50, 0.93, 0.15, 0.17, 0.17, 0.2)
        block(get(DUNKEL), x + sx * 0.1, 0, 0.62, 0.80, 0.05, 0.14)
    return build


def unterbein(sx):
    def build(get):
        x = sx * 0.105
        # Knieschoner
        block(get(DUNKEL), x, -0.085, 0.43, 0.58, 0.13, 0.05, 0.14, 0.05)
        # Unterschenkel
        block(get(STOFF), x, 0, 0.17, 0.52, 0.13, 0.15, 0.15, 0.17)
        # Stiefel: Schaft, Vorderfuß mit schräger Kappe, Sohle
        block(get(SCHWARZ), x, 0.005, 0.03, 0.21, 0.14, 0.17, 0.145, 0.165)
        block(get(SCHWARZ), x, -0.09, 0.03, 0.1, 0.135, 0.1, 0.13, 0.06, off1=(0, 0.02))
        block(get(DUNKEL), x, -0.035, 0.0, 0.035, 0.15, 0.29)
    return build


rumpf_node = part('soldat_rumpf', (0, 0, 0.95), root, rumpf)
part('soldat_kopf', (0, 0, 1.46), rumpf_node, kopf)
# Vorderseite −Y: die rechte Körperseite der Figur liegt bei −X
for side, sx in (('r', -1), ('l', 1)):
    arm_node = part(f'soldat_arm_{side}', (sx * 0.25, 0, 1.40), rumpf_node, arm(sx))
    part(f'soldat_unterarm_{side}', (sx * 0.25, 0, 1.10), arm_node, unterarm(sx))
    bein_node = part(f'soldat_bein_{side}', (sx * 0.105, 0, 0.93), root, bein(sx))
    part(f'soldat_unterbein_{side}', (sx * 0.105, 0, 0.50), bein_node, unterbein(sx))

print('Soldat gebaut:', len([o for o in sc.objects if o.type == 'MESH']), 'Meshes')

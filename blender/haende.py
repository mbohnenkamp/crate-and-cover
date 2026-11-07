# Arme für die Ego-Ansicht — baut Szene "Haende" neu: hand_r und hand_l, je Handgelenk im Ursprung, Unterarm
# zum Ellbogen nach −Y (im Spiel +Z, zur Kamera hin), Finger nach +Y (im Spiel −Z, nach vorn), Handrücken oben.
# Dieselbe Hand wie am Soldaten (hilfen.hand), nur in voller Größe. Das Spiel richtet +Z auf den Ellbogen.
# Bauen:  Blender -b blender/modelle.blend --python blender/haende.py --python-expr "import bpy; bpy.ops.wm.save_mainfile()"
# Export: blender/export.sh Haende haende
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh
from mathutils import Matrix
from hilfen import szene, mat, limb, hand, modell, fertig

sc = szene('Haende')
HAUT = mat('haende_haut', '#d9c2a5')
SCHWARZ = mat('haende_schwarz', '#17181a')
DUNKEL = mat('haende_dunkel', '#2c2e33')
STOFF = mat('haende_stoff', '#4a4d53')

# Aufbau hängend (Hand unten, Arm nach +Z), danach um 90° um X gedreht: +Z wird −Y, −Z wird +Y
ROT = Matrix.Rotation(math.radians(90), 4, 'X')


def arm(sx):
    def build(get):
        hand(get(SCHWARZ), sx, 1.0, lambda p: p)
        limb(get(SCHWARZ), 0, 0, -0.02, 0.04, 0.046, 0.046)  # Stulpe
        limb(get(HAUT), 0, 0, 0.03, 0.26, 0.04, 0.052)  # Unterarm
        limb(get(DUNKEL), 0, 0, 0.24, 0.3, 0.062, 0.062)  # gekrempelter Ärmel
        limb(get(STOFF), 0, 0, 0.3, 0.75, 0.058, 0.07)  # Oberarm, läuft aus dem Bild
        for m in (SCHWARZ, HAUT, DUNKEL, STOFF):
            bm = get(m)
            bmesh.ops.transform(bm, matrix=ROT, verts=bm.verts)
    return build


modell(sc, 'hand_r', arm(-1))
modell(sc, 'hand_l', arm(1))
fertig(sc, 'Haende')

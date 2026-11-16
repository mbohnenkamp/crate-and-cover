"""KI-Texturen aus entwuerfe/ki/texturen/ für das Spiel aufbereiten → public/textures/<name>.webp

Je Bild: Naht über die Bildkante glätten (damit es kachelt), die mittlere Farbe herausrechnen (das Bild wird
fast weiß, die Blockfarbe der Karte tönt es wie bisher) und auf die Helligkeit der alten gemalten Fläche bringen.
Wellblech entsteht aus dem Stahlbild mit aufgerechneten Rippen.
Dazu je Bild eine Reliefkarte <name>_n.webp (Normal Map): Helligkeit des Bildes als Höhe, dunkle Fugen liegen tief.

Aufruf: python3 tools/texturen.py [vorschau.jpg]
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'entwuerfe' / 'ki' / 'texturen'
OUT = ROOT / 'public' / 'textures'

# Name: (Quelle, Kantenlänge in Pixel, Zielhelligkeit = Mittel der alten Fläche, kacheln)
LOOKS = {
    'beton': ('beton', 1024, 232, True),
    'putz': ('putz', 1024, 241, True),
    'erde': ('erde', 1024, 221, True),
    'sand': ('sand', 512, 243, True),
    'stein': ('stein', 1024, 226, True),
    'ziegel': ('ziegel', 512, 227, True),
    'pflaster': ('pflaster', 1024, 196, True),
    'bretter': ('bretter', 512, 217, True),
    'kiste': ('kiste', 512, 211, False),
    'dachziegel': ('dachziegel', 512, 223, True),
    'stahl': ('stahl', 1024, 233, True),
    'laub': ('laub', 512, 199, True),
    'wellblech': ('stahl', 1024, 211, True),
}
RIBS = 8  # Wellblech: Rippen je Bild
# Stärke des Reliefs je Oberfläche (Steigung je Pixel bei 1024 px, Höhe in Standardabweichungen der Helligkeit)
RELIEF = {
    'beton': 1.2, 'putz': 1.2, 'erde': 2.0, 'sand': 1.6, 'stein': 2.6, 'ziegel': 2.4, 'pflaster': 2.8,
    'bretter': 2.2, 'kiste': 2.2, 'dachziegel': 2.6, 'stahl': 0.8, 'laub': 2.0, 'wellblech': 0.5,
}


def close_seam(a, axis, reach=24):
    """Sprung zwischen letzter und erster Zeile/Spalte je zur Hälfte auf beide Ränder verteilen."""
    a = np.moveaxis(a, axis, 0)
    jump = a[0] - a[-1]
    fall = (1 - np.arange(reach) / reach) ** 2
    a[:reach] -= 0.5 * jump[None] * fall[:, None, None]
    a[-reach:] += 0.5 * jump[None] * fall[::-1, None, None]
    return np.moveaxis(a, 0, axis)


def to_mean(a, target):
    """Auf mittlere Helligkeit `target` bringen; Lichter über 235 weich stauchen statt abschneiden."""
    scale = target / a.mean()
    for _ in range(20):
        b = a * scale
        over = b > 235
        b[over] = 235 + 20 * (1 - np.exp(-(b[over] - 235) / 20))
        scale *= target / b.mean()
    return np.clip(b, 0, 255)


def blur(h, sigma):
    """Weichzeichnen über die Bildkante hinweg (das Bild kachelt)."""
    fy = np.fft.fftfreq(h.shape[0])[:, None]
    fx = np.fft.fftfreq(h.shape[1])[None, :]
    return np.real(np.fft.ifft2(np.fft.fft2(h) * np.exp(-2 * np.pi**2 * sigma**2 * (fx**2 + fy**2))))


def relief(name, a, size):
    """Normal Map aus der Helligkeit: feine Kanten plus breitere Wölbung. Grün zeigt im Bild nach oben."""
    lum = a @ np.array([0.3, 0.59, 0.11])
    h = np.clip((lum - lum.mean()) / lum.std(), -2.5, 2.5)
    h = 0.6 * blur(h, 1.5) + 0.4 * blur(h, 5)
    k = RELIEF[name]
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2 * k
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / 2 * k
    if name == 'wellblech':  # Rippen als echte Welle, Steigung bis 0,7
        x = np.arange(a.shape[1]) / a.shape[1]
        gx = gx + (0.7 * np.cos(x * 2 * np.pi * RIBS))[None, :]
    n = np.stack([-gx, gy, np.ones_like(gx)], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).round().astype(np.uint8)).resize((size, size), Image.LANCZOS)


def build(name):
    src, size, target, tile = LOOKS[name]
    a = np.asarray(Image.open(SRC / f'{src}.png').convert('RGB'), dtype=np.float64).copy()
    if tile:
        a = close_seam(close_seam(a, 1), 0)
    normal = relief(name, a, size)
    a = a / a.mean(axis=(0, 1))  # mittlere Farbe heraus: Bild wird im Mittel neutral
    if name == 'wellblech':
        x = np.arange(a.shape[1]) / a.shape[1]
        a = a * (0.9 + 0.16 * np.sin(x * 2 * np.pi * RIBS))[None, :, None]
    a = to_mean(a, target)
    return Image.fromarray(a.round().astype(np.uint8)).resize((size, size), Image.LANCZOS), normal


OUT.mkdir(parents=True, exist_ok=True)
sheet = Image.new('RGB', (5 * 512, 3 * 512), 'white')
total = 0
for i, name in enumerate(LOOKS):
    im, normal = build(name)
    path = OUT / f'{name}.webp'
    im.save(path, 'WEBP', quality=82, method=6)
    npath = OUT / f'{name}_n.webp'
    normal.save(npath, 'WEBP', quality=85, method=6)
    total += path.stat().st_size + npath.stat().st_size
    print(f'{name:11s} {im.size[0]:5d} px  {path.stat().st_size / 1024:6.0f} KB  Relief {npath.stat().st_size / 1024:4.0f} KB'
          f'  Mittel {np.asarray(im).mean():.0f}')
    if len(sys.argv) > 1:  # Vorschau: jedes Bild 2x2 gekachelt
        t = Image.new('RGB', (im.size[0] * 2, im.size[1] * 2))
        for x in (0, im.size[0]):
            for y in (0, im.size[1]):
                t.paste(im, (x, y))
        sheet.paste(t.resize((512, 512), Image.LANCZOS), ((i % 5) * 512, (i // 5) * 512))
print(f'zusammen {total / 1024:.0f} KB')
if len(sys.argv) > 1:
    sheet.save(sys.argv[1], quality=85)

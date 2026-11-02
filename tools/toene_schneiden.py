# Aufruf: python3 tools/toene_schneiden.py   (Originale in entwuerfe/sounds/, Ausgabe public/sounds/ — beides nicht in Git)
# Schneidet kurze Spielfassungen aus den Originalen: Mono, Spitze auf -1 dB, Ausblenden am Ende, AAC (m4a)
import subprocess, re, os, sys
SRC = os.path.expanduser('~/Developer/arena-shooter/entwuerfe/sounds')
OUT = os.path.expanduser('~/Developer/arena-shooter/public/sounds')
os.makedirs(OUT, exist_ok=True)
CUTS = [  # Name, Original (ID), Start, Ende, Ausblenden
    ('gewehr_1', '10832621', 0.02, 0.75, 0.2), ('gewehr_2', '10832618', 0.03, 0.75, 0.2),
    ('gewehr_3', '10832619', 0.02, 0.75, 0.2), ('gewehr_4', '10832620', 0.00, 0.75, 0.2),
    ('pistole_1', '19886751', 0.01, 1.10, 0.3), ('pistole_2', '32239617', 0.20, 0.75, 0.15),
    ('scharf_1', '42518735', 0.00, 1.45, 0.3),
    ('nachladen_gewehr', '51818217', 0.05, 1.55, 0.1), ('nachladen_pistole', '31081006', 0.05, 0.85, 0.1),
    ('verschluss', '52390340', 0.83, 1.06, 0.05),
    ('messer', '15294811', 0.10, 0.30, 0.05), ('landung', '55926354', 0.15, 0.85, 0.2),
    ('schritt_1', '6795211', 3.37, 3.60, 0.08), ('schritt_2', '6795211', 3.99, 4.22, 0.08),
    ('schritt_3', '6795211', 4.56, 4.79, 0.08), ('schritt_4', '6795211', 4.92, 5.15, 0.08),
]
files = {f.split('_')[0]: f for f in os.listdir(SRC)}
def ff(*args):
    return subprocess.run(['ffmpeg', '-hide_banner', '-v', 'info', '-y', *args], capture_output=True, text=True)
for name, sid, start, end, fade in CUTS:
    src = os.path.join(SRC, files[sid])
    dur = end - start
    base = f'atrim={start}:{end},asetpts=PTS-STARTPTS,afade=t=in:d=0.004,afade=t=out:st={dur - fade:.3f}:d={fade}'
    m = re.search(r'max_volume: (-?[\d.]+) dB', ff('-i', src, '-ac', '1', '-af', base + ',volumedetect', '-f', 'null', '-').stderr)
    gain = -1.0 - float(m.group(1))
    out = os.path.join(OUT, name + '.m4a')
    r = ff('-i', src, '-ac', '1', '-ar', '44100', '-af', f'{base},volume={gain:.2f}dB', '-c:a', 'aac', '-b:a', '96k', out)
    if r.returncode: sys.exit(r.stderr)
    print(f'{name:18} {dur:.2f} s  Verstärkung {gain:+.1f} dB  {os.path.getsize(out)//1024} KB')

# Aufruf: python3 tools/toene_huelle.py entwuerfe/sounds
# Hüllkurve je Datei: Einsatz (erste 10 ms über 10 % der Spitze), Ausklang (letzte über 2 %), Ereignisse (Spitzen mit Abstand)
import subprocess, sys, struct, glob, os
def samples(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '22050', '-f', 's16le', '-'], capture_output=True).stdout
    return struct.unpack(f'<{len(raw)//2}h', raw)
for path in sorted(glob.glob(sys.argv[1] + '/*.wav')):
    s = samples(path)
    win = 220  # 10 ms
    env = [max(abs(x) for x in s[i:i+win]) for i in range(0, len(s) - win, win)]
    peak = max(env)
    onset = next(i for i, e in enumerate(env) if e > 0.1 * peak) * 0.01
    tail = max(i for i, e in enumerate(env) if e > 0.02 * peak) * 0.01
    events = []
    for i, e in enumerate(env):
        if e > 0.35 * peak and e == max(env[max(0, i-8):i+9]) and (not events or i - events[-1] > 12):
            events.append(i)
    print(f'{os.path.basename(path)[:55]:55} Einsatz {onset:.2f} s · Ausklang bis {tail:.2f} s · Ereignisse {[round(i*0.01, 2) for i in events][:12]}')

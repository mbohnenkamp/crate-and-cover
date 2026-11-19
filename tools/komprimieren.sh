#!/bin/bash
# Komprimiert GLB-Dateien für das Spiel: Texturen als WebP, Geometrie mit Draco. Nach jedem Export aus Blender aufrufen.
# Bewusst kein Meshopt und kein "optimize": Meshopt speichert Koordinaten als Ganzzahlen und schreibt den Faktor in die
# Lage der Knoten. Der Code setzt die Lage einzelner Teile aber selbst (Arme, Waffen, Requisiten) — dann sitzen sie falsch
# (19.11.2026). "optimize" legt außerdem Materialien zusammen. Draco lässt Knoten und Namen unverändert.
# Aufruf: tools/komprimieren.sh [datei.glb ...]   Ohne Angabe: alle Modelle in public/models.
set -e
cd "$(dirname "$0")/.."
DATEIEN="$@"
[ -z "$DATEIEN" ] && DATEIEN=$(ls public/models/*/*.glb)
TMP=$(mktemp -d)
for f in $DATEIEN; do
  npx -y @gltf-transform/cli webp "$f" "$TMP/x.glb" --quality 85 2>&1 | grep -iE "^error" || true
  npx -y @gltf-transform/cli draco "$TMP/x.glb" "$f" 2>&1 | grep -iE "^error" || true
  ls -la "$f"
done
rm -rf "$TMP"

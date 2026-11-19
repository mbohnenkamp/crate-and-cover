#!/bin/bash
# Komprimiert GLB-Dateien für das Spiel: Geometrie und Animationen mit Meshopt, Texturen als WebP.
# Nach jedem Export aus Blender aufrufen. Ohne Angabe: alle Modelle in public/models.
# --prune false, weil leere Knoten sonst wegfallen; --flatten/--join false, weil der Code Teile per Name sucht.
# Aufruf: tools/komprimieren.sh [datei.glb ...]
set -e
cd "$(dirname "$0")/.."
DATEIEN="$@"
[ -z "$DATEIEN" ] && DATEIEN=$(ls public/models/*/*.glb)
for f in $DATEIEN; do
  npx -y @gltf-transform/cli optimize "$f" "$f" --compress meshopt --texture-compress webp --texture-size 2048 \
    --simplify false --join false --instance false --flatten false --palette false --prune false 2>&1 | grep -iE "error" || true
  ls -la "$f"
done

#!/bin/bash
# Baut das Spiel und lädt es in den Zweig gh-pages (GitHub Pages): https://mbohnenkamp.github.io/crate-and-cover/
# Lizenzierte Töne (public/sounds/, MotionElements) werden vorher aus dem Build entfernt — online erzeugt das
# Spiel seine Geräusche selbst. Aufruf: ./tools/veroeffentlichen.sh
set -e
cd "$(dirname "$0")/.."
npx vite build
rm -rf dist/sounds
touch dist/.nojekyll # GitHub soll die Dateien unverändert ausliefern
if find dist -iname '*.m4a' -o -iname '*.wav' -o -iname '*.mp3' | grep -q .; then
  echo "Abbruch: Tondateien im Build" >&2
  exit 1
fi
tmp=$(mktemp -d)
cp -R dist/. "$tmp"
rm -rf dist
cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name=mbohnenkamp -c user.email=288560449+mbohnenkamp@users.noreply.github.com commit -q -m "Spiel veröffentlichen"
git push -q -f https://github.com/mbohnenkamp/crate-and-cover.git gh-pages
cd - >/dev/null
rm -rf "$tmp"
echo "Veröffentlicht: https://mbohnenkamp.github.io/crate-and-cover/ (nach etwa einer Minute)"

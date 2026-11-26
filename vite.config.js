import { defineConfig } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

// Nur im Dev-Server: nimmt Vergleichsaufnahmen aus dem Browser entgegen (src/aufnahmen.js) und legt sie unter
// aufnahmen/ ab. POST /__aufnahme?datei=vorher/altstadt-1.png, Inhalt = PNG oder JSON.
function aufnahmen() {
  return {
    name: 'aufnahmen',
    configureServer(server) {
      const root = resolve(server.config.root, 'aufnahmen');
      server.middlewares.use('/__aufnahme', (req, res) => {
        const datei = new URL(req.url, 'http://x').searchParams.get('datei') ?? '';
        const ziel = resolve(root, datei);
        if (req.method !== 'POST' || !/^[\w./-]+\.(png|jpg|json|html)$/.test(datei) || relative(root, ziel).startsWith('..')) {
          res.statusCode = 400;
          return res.end();
        }
        const teile = [];
        req.on('data', c => teile.push(c));
        req.on('end', () => {
          mkdirSync(dirname(ziel), { recursive: true });
          writeFileSync(ziel, Buffer.concat(teile));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  // Relative Pfade, damit das Spiel auch unter mbohnenkamp.github.io/crate-and-cover/ läuft
  base: './',
  build: { target: 'es2020' },
  plugins: [aufnahmen()],
});

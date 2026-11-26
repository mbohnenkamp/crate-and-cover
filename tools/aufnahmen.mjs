// Vergleichsaufnahmen ohne Browserfenster: startet einen eigenen Dev-Server, öffnet das Spiel mit ?aufnahmen=<name>
// in Playwright und wartet, bis src/aufnahmen.js fertig ist. Bilder und bericht.json landen in aufnahmen/<name>/.
// Aufruf: node tools/aufnahmen.mjs nachher [aus|leicht|voll] [--fenster] [--licht=alt …: weitere Adress-Schalter]
// Vergleich: aufnahmen/vergleich.html?a=vorher&b=nachher (über den Dev-Server öffnen)
// Ohne --fenster zeichnet der Browser je nach Rechner ohne Grafikkarte: Bilder stimmen, Bildraten nicht.

import { createServer } from 'vite';
import { chromium } from 'playwright';

const [name = 'aufnahme', effekte = 'voll'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const headless = !process.argv.includes('--fenster');
const extra = process.argv.slice(2).filter(a => /^--\w+=/.test(a)).map(a => '&' + a.slice(2)).join('');

const server = await createServer({ server: { port: 5190, strictPort: false }, logLevel: 'warn' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('Fehler im Spiel:', e.message));
  await page.goto(`${url}?aufnahmen=${encodeURIComponent(name)}&effekte=${effekte}${extra}`);
  await page.waitForFunction(() => window.aufnahmenFertig, null, { timeout: 600000, polling: 1000 });
  const bericht = await page.evaluate(() => window.aufnahmenFertig);
  console.log(`Aufnahmen „${name}“ (${effekte}) in aufnahmen/${name}/, Grafik: ${bericht.grafik}`);
  for (const [map, r] of Object.entries(bericht.karten)) console.log(`  ${map}: ${r.fps} Bilder/s`);
} finally {
  await browser.close();
  await server.close();
}

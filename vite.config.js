import { defineConfig } from 'vite';

export default defineConfig({
  // Relative Pfade, damit das Spiel auch unter mbohnenkamp.github.io/crate-and-cover/ läuft
  base: './',
  build: { target: 'es2020' },
});

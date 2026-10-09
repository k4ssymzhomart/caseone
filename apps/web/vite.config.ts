import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The workspace packages (@rota/shared, @rota/design) ship TypeScript sources; Vite compiles them with the app.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      treeshake: {
        // @rota/design is pure data (tokens, theme, logo, mascot and platform paths). Without this hint every module
        // behind its barrel counts as a dependency of whoever imports the barrel, so the landing (platform marks and
        // tokens only; its mascots are SVG files) loaded the shared chunk with all 24 mascot drawings that the
        // panel's <Mascot> draws. With it the landing JS fell from 153 to 95 kB gzip (budget 150, `npm run budget`).
        // The panel renders the same; only the chunk the mascot data lands in changes. Metro never reads this file.
        moduleSideEffects: [{ test: /[\\/]packages[\\/]design[\\/]src[\\/]/, sideEffects: false }],
      },
    },
  },
  server: { port: 5173 },
});

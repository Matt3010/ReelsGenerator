import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// In dev, Vite serves the app on 5173 and passes /api to the backend on 3000.
// In production nginx serves dist/ and passes /api to the API container.
export default defineConfig({
  plugins: [svelte()],
  build: { target: 'es2022', outDir: 'dist' },
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3000' } } },
});

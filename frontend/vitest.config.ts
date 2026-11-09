import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

// Apart from vite.config.ts because Vitest 3 brings its own Vite, whose plugin types differ from the app's.
export default defineConfig({
  // @ts-expect-error the plugins are typed for the app's Vite, and work with Vitest's as well
  plugins: [svelte(), svelteTesting()],
  test: { include: ['src/**/*.test.ts'], environment: 'jsdom', setupFiles: ['src/test/setup.ts'] },
});

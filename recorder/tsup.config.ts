import { defineConfig } from 'tsup';

// Single IIFE bundle: this is what gets pasted into a page (bookmarklet-style
// injection), so there's no module system to rely on at runtime.
export default defineConfig({
  entry: { recorder: 'src/adapters/injected.ts' },
  format: ['iife'],
  outDir: 'dist',
  minify: false,
  sourcemap: true,
  clean: true,
});

import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Content scripts are classic scripts: they cannot `import` shared chunks.
 * This builds src/content.ts as one self-contained IIFE, separately from the
 * popup/background build (which may share chunks freely).
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/content.ts'),
      formats: ['iife'],
      name: 'GuardianStreamContent',
      fileName: () => 'content.js',
    },
  },
  resolve: {
    alias: {
      '@guardianstream/types': resolve(import.meta.dirname, '../types/src'),
    },
  },
});

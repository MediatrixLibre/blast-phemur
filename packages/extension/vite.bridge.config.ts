import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * The page-world bridge: a classic script like content.js, built as its own
 * self-contained IIFE (see src/page/player-bridge.ts).
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/page/player-bridge.ts'),
      formats: ['iife'],
      name: 'GuardianStreamPlayerBridge',
      fileName: () => 'player-bridge.js',
    },
  },
  resolve: {
    alias: {
      '@guardianstream/types': resolve(import.meta.dirname, '../types/src'),
    },
  },
});

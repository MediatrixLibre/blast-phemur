import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  esbuild: {
    jsxImportSource: 'react',
    jsx: 'automatic',
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(import.meta.dirname, 'src/background.ts'),
        popup: resolve(import.meta.dirname, 'public/popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@guardianstream/types': resolve(import.meta.dirname, '../types/src'),
    },
  },
});

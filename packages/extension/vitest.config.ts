import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@guardianstream/types': resolve(__dirname, '../types/src'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});

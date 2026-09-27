import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    exclude: ['node_modules/**', 'dist/**', '.wxt/**', 'vendor/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '~': path.resolve(import.meta.dirname, './src'),
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths: the build works on any static host or sub-path (e.g. GitHub Pages).
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

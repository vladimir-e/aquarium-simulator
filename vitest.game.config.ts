import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@simulation': path.resolve(__dirname, 'src/simulation'),
    },
  },
  test: {
    include: ['game/**/*.test.ts', 'game/**/*.test.tsx'],
    environment: 'happy-dom',
    setupFiles: ['./game/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'json-summary'],
      include: ['game/**/*.ts', 'game/**/*.tsx'],
      exclude: [
        'game/**/*.test.ts',
        'game/**/*.test.tsx',
        'game/**/index.ts',
        'game/main.tsx',
      ],
    },
  },
});

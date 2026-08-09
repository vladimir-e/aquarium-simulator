import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'json-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/index.ts',
        'src/ui/**/*',
        // Calibration probes, run by hand — every `npm run probe:*` script.
        'src/simulation/tests/par-dose-response.ts',
        'src/simulation/tests/default-fixture-survival.ts',
        'src/simulation/tests/oxygen-limited-draw.ts',
        'src/simulation/tests/light-response.ts',
        'src/simulation/tests/nitrification-on-air.ts',
        'src/simulation/tests/plant-respiration.ts',
        'src/simulation/tests/surplus-bank.ts',
        'src/simulation/tests/dark-tank.ts',
        'src/simulation/tests/ordinary-tanks.ts',
        'src/simulation/tests/starvation-share.ts',
      ],
    },
  },
});

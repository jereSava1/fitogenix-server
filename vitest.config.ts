import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'etl/**/*.test.ts'],
    env: { LOG_LEVEL: 'silent' },
    // Mínimos (R-10): bajar de acá rompe el CI. Scoring y auth son las zonas de alto riesgo.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/**/testing/**', 'src/main.ts'],
      reporter: ['text-summary'],
      thresholds: {
        lines: 95,
        branches: 90,
        'src/modules/scoring/**': { lines: 99, branches: 95 },
        'src/modules/auth/**': { lines: 99, branches: 95 },
        'src/platform/http/auth.ts': { lines: 100, branches: 100 },
      },
    },
  },
});

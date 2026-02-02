import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'oauth',
    include: [
      'src/lib/oauth/__tests__/**/*.test.ts',
      'tests/oauth/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.d.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/lib/oauth/**/*.ts',
        'src/pipeline/before/oauth.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    isolate: true,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4,
      },
    },
    reporters: ['verbose'],
    logHeapUsage: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@protocols': path.resolve(__dirname, './src/protocols'),
    },
  },
});

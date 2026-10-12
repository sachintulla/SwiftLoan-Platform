import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Website unit/component tests. Pure rules run in node; component tests opt into
// jsdom with a `// @vitest-environment jsdom` pragma.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['src/**/*.test.{ts,tsx}'], restoreMocks: true },
});

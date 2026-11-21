import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    poolOptions: { forks: { execArgv: ['--localstorage-file=node_modules/.vitest-localstorage'] } },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/ui/**'],
    },
  },
});

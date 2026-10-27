import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { setupFiles: ['./src/__tests__/setup.ts'], env: { VITEST: 'true' }, maxWorkers: 2 } });

import { defineConfig } from 'vite';
export default defineConfig({ server: { host: '0.0.0.0' }, test: { environment: 'node', include: ['tests/**/*.test.ts'] } });

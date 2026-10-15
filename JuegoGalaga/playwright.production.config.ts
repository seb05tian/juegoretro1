import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/production', fullyParallel: false, workers: 1, reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174' },
  webServer: { command: 'npm run preview -- --port 4174 --strictPort', url: 'http://127.0.0.1:4174', reuseExistingServer: !process.env.CI, timeout: 60_000 },
});

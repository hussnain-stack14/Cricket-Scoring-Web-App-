import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000', browserName: 'chromium', channel: 'chromium', headless: true, actionTimeout: 15000 },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
  },
  reporter: 'list',
});

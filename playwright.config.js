import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    channel: 'chromium',
    headless: true,
    actionTimeout: 15000,
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    env: { PORT: '4173', SESSION_SECRET: randomBytes(32).toString('hex') },
  },
  reporter: 'list',
});

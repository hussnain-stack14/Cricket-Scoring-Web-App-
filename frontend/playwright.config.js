import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const baseURL = process.env.CREASE_TEST_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL,
    browserName: 'chromium',
    channel: 'chromium',
    headless: true,
    actionTimeout: 15000,
  },
  webServer: {
    command: process.env.CREASE_TEST_DEV
      ? 'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1'
      : 'node scripts/serve.mjs',
    url: baseURL,
    reuseExistingServer: !!process.env.CREASE_TEST_URL,
    env: { PORT: '4173', SESSION_SECRET: randomBytes(32).toString('hex') },
  },
  reporter: 'list',
});

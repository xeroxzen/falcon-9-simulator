import { defineConfig } from '@playwright/test';

const isHeadless = process.env.HEADLESS === '1';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    browserName: 'chromium',
    headless: isHeadless,
    launchOptions: {
      args: isHeadless
        ? [
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--enable-unsafe-swiftshader',
          ]
        : ['--enable-webgl', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'pnpm dev --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});

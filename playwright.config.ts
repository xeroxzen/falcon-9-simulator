import { defineConfig, devices } from '@playwright/test';

const isHeadless = process.env.HEADLESS === '1';
const isUncapped = process.env.UNCAPPED === '1';

const launchArgs = isHeadless
  ? [
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
    ]
  : isUncapped
    ? [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--disable-gpu-vsync',
        '--disable-frame-rate-limit',
      ]
    : ['--enable-webgl', '--ignore-gpu-blocklist'];

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
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    browserName: 'chromium',
    headless: isHeadless,
    launchOptions: {
      args: launchArgs,
    },
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile\.spec\.ts/,
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'iphone-13',
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        browserName: 'chromium',
      },
    },
    {
      name: 'pixel-7',
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        defaultBrowserType: 'chromium',
        browserName: 'chromium',
      },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'pnpm dev --port 5173',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 30_000,
      },
});

import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.VISUAL_QA_PORT ?? 5173);
const baseURL = process.env.VISUAL_QA_BASE_URL ?? `http://127.0.0.1:${port}`;
const shouldStartServer = process.env.VISUAL_QA_SKIP_SERVER !== '1';

export default defineConfig({
  testDir: './visual',
  testMatch: '**/*.visual.ts',
  outputDir: './artifacts/visual/test-results',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/visual/html-report', open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.VISUAL_QA_VIDEO === '1' ? 'on' : 'retain-on-failure',
  },
  webServer: shouldStartServer
    ? {
        command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 412, height: 915 },
      },
    },
  ],
});

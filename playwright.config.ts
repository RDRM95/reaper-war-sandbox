import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  timeout: 60000,
  use: {
    headless: true,
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1536, height: 900 },
    launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] },
    trace: 'retain-on-failure',
    screenshot: 'on'
  }
});

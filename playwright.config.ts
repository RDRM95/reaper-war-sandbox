import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  use: {
    headless: true,
    viewport: { width: 1536, height: 900 },
    launchOptions: { args: ['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] },
    trace: 'retain-on-failure',
    screenshot: 'on'
  }
});

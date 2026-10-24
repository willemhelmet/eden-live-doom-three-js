import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 60_000, workers: 1,
  use: { baseURL: `http://127.0.0.1:3219${process.env.DEMO_BASE_PATH || '/'}`, viewport: { width: 1280, height: 800 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] } },
  webServer: { command: 'node server.mjs', url: 'http://127.0.0.1:3219/api/config', env: { PORT: '3219', REACTOR_API_KEY: '' }, reuseExistingServer: false },
});

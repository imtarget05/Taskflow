import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E — critical paths (login → dashboard → board → task).
 *
 * Chạy: `npm run test:e2e -w client`
 * Yêu cầu: dev stack đang chạy (npm run dev) + DB seeded
 * (alice@taskflow.dev / password123 — xem AGENTS.md).
 * Stack tự khởi động sẵn thì Playwright chỉ kết nối (không tự spawn).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

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
  // Toàn bộ suite chia sẻ 1 stack + 1 tài khoản demo + rate-limit login theo IP.
  // Chạy song song giữa các file (mặc định) làm nhiều spec login đồng thời →
  // vượt RATE_LIMIT_AUTH_LOGIN, gây 429 kẹt ở /login. Serialize = deterministic.
  workers: 1,
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

import { expect, test } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? 'alice@taskflow.dev';
const PASSWORD = process.env.E2E_PASSWORD ?? 'password123';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

test.describe('Smart Route — POST /api/agent/route', () => {
  test('preview GET routes correctly without side effects', async ({ page }) => {
    await login(page);
    const csrfCookie = (await page.context().cookies()).find((c) => c.name === 'csrf_token');
    const headers = csrfCookie ? { 'x-csrf-token': csrfCookie.value } : {};
    const cases: Array<{ text: string; agent: 'chat' | 'sc_agentic' | 'ml_agent' }> = [
      { text: 'hypothesis testing', agent: 'chat' },
      { text: 'reorder point 500', agent: 'ml_agent' },
      { text: 'đơn hàng cần phê duyệt', agent: 'sc_agentic' },
      { text: 'xin chào', agent: 'chat' },
    ];
    for (const c of cases) {
      const res = await page.request.get(`/api/agent/route?text=${encodeURIComponent(c.text)}`, { headers });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.data.agent).toBe(c.agent);
    }
  });

  test('POST route executes chat without error', async ({ page }) => {
    await login(page);
    const csrfCookie = (await page.context().cookies()).find((c) => c.name === 'csrf_token');
    const headers = csrfCookie ? { 'x-csrf-token': csrfCookie.value } : {};
    const res = await page.request.post('/api/agent/route', {
      data: { text: 'tồn kho dự báo?' },
      headers,
    });
    // Even if LLM not configured, supervisor returns structured result with error field, not 500
    expect([200, 503].includes(res.status())).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBeTruthy();
    expect(body.data.routed.agent).toBe('ml_agent');
    expect(body.data.result.agent).toBe('ml_agent');
  });

  test('POST route with forced agent overrides keyword', async ({ page }) => {
    await login(page);
    const csrfCookie = (await page.context().cookies()).find((c) => c.name === 'csrf_token');
    const headers = csrfCookie ? { 'x-csrf-token': csrfCookie.value } : {};
    const res = await page.request.post('/api/agent/route', {
      data: { text: 'đơn hàng', agent: 'chat' },
      headers,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.routed.agent).toBe('chat');
    expect(body.data.result.agent).toBe('chat');
  });
});

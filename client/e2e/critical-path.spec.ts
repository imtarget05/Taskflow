import { expect, test } from '@playwright/test';

/**
 * Luồng nghiệm thu: login → dashboard → tạo board → tạo task.
 * Dùng tài khoản demo (xem AGENTS.md): alice@taskflow.dev / password123.
 * Có thể override qua env E2E_EMAIL / E2E_PASSWORD.
 */
const EMAIL = process.env.E2E_EMAIL ?? 'alice@taskflow.dev';
const PASSWORD = process.env.E2E_PASSWORD ?? 'password123';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/dashboard');
}

test('login lands on the dashboard', async ({ page }) => {
  await login(page);
  await expect(page.getByText(/Welcome back/i)).toBeVisible();
});

test('create a board project and add a task on it', async ({ page }) => {
  await login(page);

  // Tạo project qua API (dùng cookie đã đăng nhập của page request context).
  // POST cần CSRF double-submit: đọc cookie csrf_token và gửi lại ở header.
  const csrfCookie = (await page.context().cookies()).find((c) => c.name === 'csrf_token');
  const projectName = `E2E Board ${Date.now()}`;
  const res = await page.request.post('/api/projects', {
    data: { name: projectName },
    headers: csrfCookie ? { 'x-csrf-token': csrfCookie.value } : {},
  });
  if (!res.ok()) {
    console.error('create project failed:', res.status(), await res.text());
  }
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const projectId = body.data?.id ?? body.id;
  expect(projectId).toBeTruthy();

  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText(projectName).first()).toBeVisible();

  // Thêm task ở cột đầu tiên: bấm "Add a task" → hiện form → điền title → Add task
  await page.getByRole('button', { name: 'Add a task' }).first().click();
  const titleInput = page.getByLabel('New task title').first();
  await expect(titleInput).toBeVisible();
  const taskTitle = `E2E task ${Date.now()}`;
  await titleInput.fill(taskTitle);
  await page.getByRole('button', { name: 'Add task', exact: true }).first().click();
  await expect(page.getByText(taskTitle).first()).toBeVisible();
});

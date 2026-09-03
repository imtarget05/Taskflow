import { expect, test } from '@playwright/test';

/**
 * E2E: luồng UI AI Assistant (ChatBox) end-to-end.
 * - Login → dashboard → mở ChatBox (FAB) → gửi tin → xử lý phản hồi.
 * - Quan trọng: ở môi trường KHÔNG có LLM (CI/dev mặc định, LLM_MODEL trống),
 *   nút gửi hiện toast "AI assistant unavailable" thay vì trả lời — vẫn phải
 *   graceful, không crash, không 500. Spec này assertion CẢ 2 nhánh để chạy được
 *   ở mọi môi trường (có hoặc không có LLM).
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

/**
 * Mở ChatBox và ĐỢI trạng thái agent được resolve (Sẵn sàng / Chưa cấu hình)
 * trước khi có bất kỳ thao tác gửi nào. Tránh race: nếu submit trước khi
 * `/agent/status` trả về (canUseAgent === null), client sẽ gọi `/agent/chat`
 * thật — trong CI (không LLM) sẽ ra toast "Agent request failed" thay vì
 * "AI assistant unavailable", làm spec flaky. Bước này khiến luồng deterministic.
 */
async function openChatBox(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Mở AI Assistant' }).click();
  // Header có thể khớp cả parent (strict violation) → dùng .first().
  await expect(page.getByText('AI Assistant').first()).toBeVisible();
  // Trạng thái hiển thị 1 trong 2: "Sẵn sàng · TaskFlow AI" hoặc "Chưa cấu hình".
  await expect(page.getByText(/Sẵn sàng|Chưa cấu hình/).first()).toBeVisible();
}

test.describe('AI Assistant — ChatBox UI flow', () => {
  test('mở ChatBox từ FAB, header hiển thị, không crash', async ({ page }) => {
    await login(page);

    // FAB mở chat
    const fab = page.getByRole('button', { name: 'Mở AI Assistant' });
    await expect(fab).toBeVisible();
    await fab.click();

    // Header ChatBox
    await expect(page.getByText('AI Assistant').first()).toBeVisible();
    // Input + nút gửi xuất hiện
    await expect(page.getByLabel('Nhắn tin cho AI Assistant')).toBeVisible();
    await expect(page.getByLabel('Gửi tin nhắn')).toBeVisible();
  });

  test('gửi tin nhắn — graceful ở cả 2 nhánh (có LLM / không LLM), không crash', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await login(page);
    await openChatBox(page);

    const input = page.getByLabel('Nhắn tin cho AI Assistant');
    const probeMessage = `E2E probe ${Date.now()}`;
    await input.fill(probeMessage);
    await page.getByLabel('Gửi tin nhắn').click();

    // Nhánh 1 (LLM configured): bubble user message xuất hiện (optimistic).
    // Nhánh 2 (không LLM): toast "AI assistant unavailable" xuất hiện.
    // Cả 2 đều là graceful — không 500, không crash.
    const userBubble = page.getByText(probeMessage).first();
    const unavailableToast = page.getByText(/AI assistant (is )?unavailable/i);
    await expect(userBubble.or(unavailableToast)).toBeVisible();

    // Không có lỗi runtime / pageerror trong suốt luồng.
    expect(pageErrors).toEqual([]);
    // Cho phép console error từ third-party (favicon...) — chỉ assert không pageerror.
  });

  test('gửi bằng phím Enter cũng hoạt động', async ({ page }) => {
    await login(page);
    await openChatBox(page);

    const input = page.getByLabel('Nhắn tin cho AI Assistant');
    await input.fill('Enter probe');
    // Enter không Shift → submit (xem ChatBox.handleSubmit)
    await input.press('Enter');

    const userBubble = page.getByText('Enter probe').first();
    const unavailableToast = page.getByText(/AI assistant (is )?unavailable/i);
    await expect(userBubble.or(unavailableToast)).toBeVisible();
  });
});

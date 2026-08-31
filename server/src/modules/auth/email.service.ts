import nodemailer from 'nodemailer';
import { env, isEmailConfigured } from '../../config/env';
import { logger } from '../../lib/logger';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!isEmailConfigured()) return null;
  
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return transporter;
}

export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  userName?: string
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    logger.warn('SMTP not configured — skipping password reset email');
    return false;
  }

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const from = env.MAIL_FROM ?? `TaskFlow <${env.SMTP_USER}>`;

  const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Đặt lại mật khẩu — TaskFlow</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 480px; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 32px 32px 16px; text-align: center;">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: #6366f1; border-radius: 12px; margin-bottom: 16px;">
                <span style="color: #ffffff; font-size: 20px; font-weight: 700;">T</span>
              </div>
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #1e293b;">Đặt lại mật khẩu</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px;">
              <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">
                Xin chào${userName ? ` <strong>${userName}</strong>` : ''},
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
                Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản TaskFlow của mình. Nhấn nút bên dưới để đặt lại mật khẩu mới:
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding: 0 0 24px;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background: #6366f1; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">Đặt lại mật khẩu</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: #64748b;">
                Hoặc copy link này vào trình duyệt:<br>
                <a href="${resetUrl}" style="color: #6366f1; word-break: break-all;">${resetUrl}</a>
              </p>
              <div style="padding: 16px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #92400e;">
                  <strong>Lưu ý:</strong> Link này có hiệu lực trong 15 phút. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                © 2026 TaskFlow. Tất cả quyền được bảo lưu.<br>
                Email này được gửi tự động, vui lòng không trả lời.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Đặt lại mật khẩu — TaskFlow

Xin chào${userName ? ` ${userName}` : ''},

Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản TaskFlow.

Link đặt lại mật khẩu: ${resetUrl}

Link này có hiệu lực trong 15 phút.
Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.

© 2026 TaskFlow`;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: 'Đặt lại mật khẩu — TaskFlow',
      html,
      text,
    });
    logger.info({ messageId: info.messageId, to }, 'Password reset email sent');
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, to }, 'Failed to send password reset email');
    return false;
  }
}

export async function verifyEmailConnection(): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  try {
    await transporter.verify();
    logger.info('SMTP connection verified');
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'SMTP connection failed');
    return false;
  }
}

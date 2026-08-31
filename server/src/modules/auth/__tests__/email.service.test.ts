import { sendPasswordResetEmail, verifyEmailConnection } from '../email.service';

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-123' });
const mockVerify = jest.fn().mockResolvedValue(true);

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
    verify: mockVerify,
  })),
}));

import * as envModule from '../../../config/env';

describe('email.service', () => {
  const originalEnv = { ...envModule.env };

  beforeEach(() => {
    jest.clearAllMocks();
    envModule.env.SMTP_HOST = 'smtp.test.com';
    envModule.env.SMTP_PORT = 587;
    envModule.env.SMTP_USER = 'test@test.com';
    envModule.env.SMTP_PASS = 'password';
    envModule.env.MAIL_FROM = 'Test <test@test.com>';
    envModule.env.FRONTEND_URL = 'http://localhost:5173';
  });

  afterAll(() => {
    Object.assign(envModule.env, originalEnv);
  });

  describe('sendPasswordResetEmail', () => {
    it('returns true when email is sent successfully', async () => {
      const result = await sendPasswordResetEmail('user@example.com', 'token123', 'Test User');
      expect(result).toBe(true);
    });

    it('returns false when SMTP is not configured', async () => {
      envModule.env.SMTP_HOST = undefined;
      envModule.env.SMTP_USER = undefined;
      envModule.env.SMTP_PASS = undefined;
      
      const result = await sendPasswordResetEmail('user@example.com', 'token123');
      expect(result).toBe(false);
    });

    it('includes reset URL in email', async () => {
      await sendPasswordResetEmail('user@example.com', 'my-token', 'Test User');
      
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Đặt lại mật khẩu — TaskFlow',
        })
      );
      
      const callArg = mockSendMail.mock.calls[0][0];
      expect(callArg.html).toContain('my-token');
      expect(callArg.text).toContain('my-token');
    });
  });

  describe('verifyEmailConnection', () => {
    it('returns true when SMTP is configured and connection works', async () => {
      const result = await verifyEmailConnection();
      expect(result).toBe(true);
    });

    it('returns false when SMTP is not configured', async () => {
      envModule.env.SMTP_HOST = undefined;
      envModule.env.SMTP_USER = undefined;
      envModule.env.SMTP_PASS = undefined;
      
      const result = await verifyEmailConnection();
      expect(result).toBe(false);
    });
  });
});

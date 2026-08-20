import { forgotPassword, resetPassword } from '../auth.controller';
import * as authService from '../auth.service';
import { StatusCodes } from 'http-status-codes';

jest.mock('../../../lib/prisma', () => ({
  prisma: { user: {}, refreshToken: {} },
}));

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.redirect = jest.fn(() => res);
  res.cookie = jest.fn(() => res);
  res.clearCookie = jest.fn(() => res);
  return res;
}

describe('auth.controller password reset', () => {
  it('forgotPassword returns success and optional resetToken', async () => {
    jest.spyOn(authService, 'forgotPassword').mockResolvedValue({ resetToken: 'tok' });
    const req: any = { body: { email: 'a@b.com' } };
    const res = mockRes();
    await forgotPassword(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, resetToken: 'tok' }),
    );
  });

  it('forgotPassword validates input', async () => {
    const req: any = { body: { email: 'not-an-email' } };
    const res = mockRes();
    const next = jest.fn();
    await forgotPassword(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.anything());
  });

  it('resetPassword returns success on valid request', async () => {
    jest.spyOn(authService, 'resetPassword').mockResolvedValue();
    const req: any = { body: { token: 'tok', newPassword: 'newpassword123' } };
    const res = mockRes();
    await resetPassword(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: expect.any(String) }),
    );
  });

  it('resetPassword validates input', async () => {
    const req: any = { body: { token: '', newPassword: 'short' } };
    const res = mockRes();
    const next = jest.fn();
    await resetPassword(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.anything());
  });
});

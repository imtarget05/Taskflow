import { Request, Response } from 'express';
import { AppError } from '../../utils/errors';
import { CSRF_COOKIE, CSRF_HEADER, csrfProtection, generateCsrfToken } from '../csrf';

describe('csrfProtection', () => {
  function mockReq(overrides: Partial<Request> = {}): Request {
    return {
      method: 'POST',
      path: '/api/projects',
      headers: {},
      cookies: {},
      ...overrides,
    } as unknown as Request;
  }

  const next = jest.fn();

  beforeEach(() => next.mockReset());

  it('lets safe methods through', () => {
    const req = mockReq({ method: 'GET', cookies: { [CSRF_COOKIE]: 'tok' } });
    csrfProtection(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('skips pre-auth routes (login/register)', () => {
    const req = mockReq({ path: '/api/auth/login', cookies: { [CSRF_COOKIE]: 'tok' } });
    csrfProtection(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('enforces CSRF on logout (no longer blanket-skipped)', () => {
    // Logout carries the session; a malicious site must not force it out.
    const req = mockReq({
      path: '/api/auth/logout',
      cookies: { [CSRF_COOKIE]: 'token' },
      headers: { [CSRF_HEADER]: 'wrong' },
    });
    expect(() => csrfProtection(req, {} as Response, next)).toThrow(AppError);
  });

  it('lets a logout through when the CSRF header matches', () => {
    const req = mockReq({
      path: '/api/auth/logout',
      cookies: { [CSRF_COOKIE]: 'tok' },
      headers: { [CSRF_HEADER]: 'tok' },
    });
    csrfProtection(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes requests without a csrf cookie (pre-auth state)', () => {
    const req = mockReq({ cookies: {} });
    csrfProtection(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects a mutation when the header does not match the cookie', () => {
    const req = mockReq({ cookies: { [CSRF_COOKIE]: 'cookie-token' }, headers: { [CSRF_HEADER]: 'wrong' } });
    expect(() => csrfProtection(req, {} as Response, next)).toThrow(AppError);
  });

  it('rejects a mutation with a cookie but no header', () => {
    const req = mockReq({ cookies: { [CSRF_COOKIE]: 'cookie-token' } });
    expect(() => csrfProtection(req, {} as Response, next)).toThrow(AppError);
  });

  it('passes when header matches the cookie', () => {
    const req = mockReq({
      cookies: { [CSRF_COOKIE]: 'cookie-token' },
      headers: { [CSRF_HEADER]: 'cookie-token' },
    });
    csrfProtection(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates unique 64-char hex tokens', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
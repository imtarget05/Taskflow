import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../../utils/token';

describe('token utils', () => {
  const user = { id: 'u1', email: 'test@taskflow.dev', name: 'Test' };

  it('signs and verifies an access token', () => {
    const token = signAccessToken(user);
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.email).toBe('test@taskflow.dev');
    expect(payload.type).toBe('access');
  });

  it('signs and verifies a refresh token', () => {
    const token = signRefreshToken('u1');
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.type).toBe('refresh');
  });

  it('rejects access tokens on the refresh verifier', () => {
    const token = signAccessToken(user);
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  it('throws on malformed tokens', () => {
    expect(() => verifyAccessToken('not-a-jwt')).toThrow();
  });
});

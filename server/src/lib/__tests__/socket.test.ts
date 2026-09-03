import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Server as HTTPServer } from 'http';

const serverCtor = jest.fn();

jest.mock('socket.io', () => ({
  Server: class {
    use = jest.fn();
    on = jest.fn();
    constructor(...args: unknown[]) {
      serverCtor(...args);
    }
  },
}));

jest.mock('../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    CORS_ORIGINS: ['http://localhost:5173'],
  },
}));

import { initSocket, SOCKET_PATH } from '../socket';

describe('initSocket — socket path', () => {
  beforeEach(() => {
    serverCtor.mockClear();
  });

  it('exposes SOCKET_PATH dưới /api để đi qua cùng proxy với REST API', () => {
    expect(SOCKET_PATH).toBe('/api/socket.io');
  });

  it('khởi tạo Server với path=/api/socket.io (same-origin qua Pages Function proxy)', () => {
    initSocket({} as HTTPServer);
    expect(serverCtor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ path: SOCKET_PATH })
    );
  });
});

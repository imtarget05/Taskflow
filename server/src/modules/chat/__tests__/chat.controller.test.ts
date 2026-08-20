import { Request, Response, NextFunction } from 'express';
import { get, send } from '../chat.controller';
import { SOCKET_EVENTS } from '../../../lib/socket';

jest.mock('../chat.service', () => ({
  getGroup: jest.fn(),
  sendMessage: jest.fn(),
}));

jest.mock('../../../lib/socket', () => ({
  emitToProject: jest.fn(),
  SOCKET_EVENTS: { CHAT_MESSAGE: 'chat:message' },
}));

import { getGroup, sendMessage } from '../chat.service';
import { emitToProject } from '../../../lib/socket';

const mockedGetGroup = getGroup as jest.Mock;
const mockedSendMessage = sendMessage as jest.Mock;
const mockedEmit = emitToProject as jest.Mock;

function mockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    headersSent: false,
  } as unknown as Response;
  return res;
}

describe('chat.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('get', () => {
    it('returns the project chat group', async () => {
      mockedGetGroup.mockResolvedValue({ id: 'g1' });
      const req = { params: { projectId: 'p1' }, user: { id: 'u1' } } as unknown as Request;
      const res = mockResponse();

      await get(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedGetGroup).toHaveBeenCalledWith('p1', 'u1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'g1' } });
    });
  });

  describe('send', () => {
    it('creates the message and emits chat:message to the room', async () => {
      mockedSendMessage.mockResolvedValue({ id: 'm1', body: 'hello' });
      const req = {
        params: { projectId: 'p1' },
        user: { id: 'u1' },
        body: { body: 'hello' },
      } as unknown as Request;
      const res = mockResponse();

      await send(req, res, jest.fn() as unknown as NextFunction);

      expect(mockedSendMessage).toHaveBeenCalledWith('p1', 'u1', 'hello');
      expect(mockedEmit).toHaveBeenCalledWith('p1', SOCKET_EVENTS.CHAT_MESSAGE, { id: 'm1', body: 'hello' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'm1', body: 'hello' } });
    });

    it('rejects empty messages', async () => {
      const req = {
        params: { projectId: 'p1' },
        user: { id: 'u1' },
        body: { body: '   ' },
      } as unknown as Request;
      const res = mockResponse();
      const next = jest.fn();

      await send(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
      expect(mockedSendMessage).not.toHaveBeenCalled();
    });
  });
});
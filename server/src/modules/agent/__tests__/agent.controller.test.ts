import { StatusCodes } from 'http-status-codes';
import {
  chat,
  status,
  listConversations,
  getConversation,
  deleteConversation,
  uploadFile,
} from '../agent.controller';
import * as agentService from '../agent.service';

jest.mock('../agent.service', () => ({
  agentStatus: jest.fn(),
  chat: jest.fn(),
  listConversations: jest.fn(),
  getConversation: jest.fn(),
  deleteConversation: jest.fn(),
  parseUpload: jest.fn(),
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
  UPLOAD_EXTENSIONS: new Set(['.txt']),
}));

function mockRes(): any {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function mockReq(overrides: Record<string, unknown> = {}): any {
  return { user: { id: 'u1', email: 'a@b.c', name: 'A' }, ...overrides };
}

describe('agent.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('chat returns 200 with the reply and conversation id', async () => {
    (agentService.chat as jest.Mock).mockResolvedValue({ reply: 'hi', conversationId: 'c1' });
    const req = mockReq({ body: { messages: [{ role: 'user', content: 'hi' }] } });
    const res = mockRes();

    await chat(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, reply: 'hi' }));
    expect(agentService.chat).toHaveBeenCalledWith(
      'u1',
      [{ role: 'user', content: 'hi' }],
      expect.objectContaining({ projectId: null, conversationId: null })
    );
  });

  it('chat validates the request body', async () => {
    const req = mockReq({ body: { messages: [{ role: 'user', content: '' }] } });
    const res = mockRes();
    const next = jest.fn();

    await chat(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.anything());
    expect(res.json).not.toHaveBeenCalled();
  });

  it('status returns the agent configuration', async () => {
    (agentService.agentStatus as jest.Mock).mockReturnValue({ enabled: false, provider: 'ollama', model: null });
    const req = mockReq();
    const res = mockRes();

    await status(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, enabled: false }));
  });

  it('listConversations returns the user conversations', async () => {
    (agentService.listConversations as jest.Mock).mockResolvedValue([{ id: 'c1' }]);
    const req = mockReq({ query: {} });
    const res = mockRes();

    await listConversations(req, res, jest.fn());

    expect(agentService.listConversations).toHaveBeenCalledWith('u1', null);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 'c1' }] });
  });

  it('getConversation returns a single conversation', async () => {
    (agentService.getConversation as jest.Mock).mockResolvedValue({ id: 'c1' });
    const req = mockReq({ params: { conversationId: 'c1' } });
    const res = mockRes();

    await getConversation(req, res, jest.fn());

    expect(agentService.getConversation).toHaveBeenCalledWith('u1', 'c1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'c1' } });
  });

  it('deleteConversation removes the conversation', async () => {
    (agentService.deleteConversation as jest.Mock).mockResolvedValue(undefined);
    const req = mockReq({ params: { conversationId: 'c1' } });
    const res = mockRes();

    await deleteConversation(req, res, jest.fn());

    expect(agentService.deleteConversation).toHaveBeenCalledWith('u1', 'c1');
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('uploadFile parses the uploaded document', async () => {
    (agentService.parseUpload as jest.Mock).mockResolvedValue({ fileName: 'a.txt', text: 'hi' });
    const req = mockReq({ file: { originalname: 'a.txt', buffer: Buffer.from('hi') } });
    const res = mockRes();

    await uploadFile(req, res, jest.fn());

    expect(agentService.parseUpload).toHaveBeenCalledWith('a.txt', Buffer.from('hi'));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('uploadFile rejects requests without a file', async () => {
    const req = mockReq({ file: undefined });
    const res = mockRes();
    const next = jest.fn();

    await uploadFile(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});
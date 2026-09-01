import { StatusCodes } from 'http-status-codes';
import { chatStream } from '../agent.controller';
import * as agentService from '../agent.service';

// Mock the agent.service module
jest.mock('../agent.service', () => ({
  agentStatus: jest.fn(),
  chat: jest.fn(),
  chatStream: jest.fn(),
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
  res.setHeader = jest.fn(() => res);
  res.flushHeaders = jest.fn(() => res);
  res.write = jest.fn(() => true);
  res.end = jest.fn(() => res);
  return res;
}

function mockReq(overrides: Record<string, unknown> = {}): any {
  const req: any = { user: { id: 'u1', email: 'a@b.c', name: 'A' }, headers: {}, query: {}, ...overrides };
  req.on = jest.fn(() => req);
  return req;
}

describe('agent.controller chatStream (SSE)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets SSE headers when streaming is requested', async () => {
    const streamEvents = async function* () {
      yield { type: 'token', data: 'Hello' };
      yield { type: 'done', data: {} };
    };
    (agentService.chatStream as jest.Mock).mockReturnValue(streamEvents());

    const req = mockReq({
      body: { messages: [{ role: 'user', content: 'hi' }] },
      headers: { accept: 'text/event-stream' },
    });
    const res = mockRes();

    await chatStream(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.flushHeaders).toHaveBeenCalled();
  });

  it('writes SSE events for each token', async () => {
    const streamEvents = async function* () {
      yield { type: 'token', data: 'Hello' };
      yield { type: 'token', data: ' world' };
      yield { type: 'done', data: {} };
    };
    (agentService.chatStream as jest.Mock).mockReturnValue(streamEvents());

    const req = mockReq({
      body: { messages: [{ role: 'user', content: 'hi' }] },
      headers: { accept: 'text/event-stream' },
    });
    const res = mockRes();

    await chatStream(req, res);

    expect(res.write).toHaveBeenCalledWith('data: {"type":"token","data":"Hello"}\n\n');
    expect(res.write).toHaveBeenCalledWith('data: {"type":"token","data":" world"}\n\n');
    expect(res.write).toHaveBeenCalledWith('data: {"type":"done","data":{}}\n\n');
  });

  it('emits action events for tool calls', async () => {
    const streamEvents = async function* () {
      yield { type: 'token', data: 'Creating...' };
      yield { type: 'action', data: { name: 'create_project', params: { name: 'Test' } } };
      yield { type: 'done', data: {} };
    };
    (agentService.chatStream as jest.Mock).mockReturnValue(streamEvents());

    const req = mockReq({
      body: { messages: [{ role: 'user', content: 'create project' }] },
      headers: { accept: 'text/event-stream' },
    });
    const res = mockRes();

    await chatStream(req, res);

    expect(res.write).toHaveBeenCalledWith(
      'data: {"type":"action","data":{"name":"create_project","params":{"name":"Test"}}}\n\n'
    );
  });

  it('emits error events when streaming fails', async () => {
    const streamEvents = async function* () {
      yield { type: 'token', data: 'Starting...' };
      yield { type: 'error', data: { message: 'LLM unavailable' } };
    };
    (agentService.chatStream as jest.Mock).mockReturnValue(streamEvents());

    const req = mockReq({
      body: { messages: [{ role: 'user', content: 'hi' }] },
      headers: { accept: 'text/event-stream' },
    });
    const res = mockRes();

    await chatStream(req, res);

    expect(res.write).toHaveBeenCalledWith(
      'data: {"type":"error","data":{"message":"LLM unavailable"}}\n\n'
    );
  });

  it('registers client disconnect handler', async () => {
    const streamEvents = async function* () {
      yield { type: 'token', data: 'Hello' };
      yield { type: 'done', data: {} };
    };
    (agentService.chatStream as jest.Mock).mockReturnValue(streamEvents());

    const req = mockReq({
      body: { messages: [{ role: 'user', content: 'hi' }] },
      headers: { accept: 'text/event-stream' },
    });
    const res = mockRes();

    await chatStream(req, res);

    expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  it('falls back to non-streaming when stream not requested', async () => {
    (agentService.chat as jest.Mock).mockResolvedValue({
      reply: 'Hello world',
      conversationId: 'c1',
    });

    const req = mockReq({
      body: { messages: [{ role: 'user', content: 'hi' }] },
      headers: {},
    });
    const res = mockRes();

    await chatStream(req, res);

    expect(agentService.chat).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, reply: 'Hello world' })
    );
  });

  it('validates request body before streaming', () => {
    const req = mockReq({
      body: { messages: [{ role: 'user', content: '' }] },
      headers: { accept: 'text/event-stream' },
    });
    const res = mockRes();

    expect(() => chatStream(req, res)).toThrow('Validation failed');
  });
});

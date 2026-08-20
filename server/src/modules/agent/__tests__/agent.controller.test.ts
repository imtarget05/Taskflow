import { StatusCodes } from 'http-status-codes';
import { chat, status } from '../agent.controller';
import * as agentService from '../agent.service';

jest.mock('../agent.service', () => ({
  agentStatus: jest.fn(),
  chat: jest.fn(),
}));

function mockRes(): any {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('agent.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('chat returns 200 with the reply', async () => {
    (agentService.chat as jest.Mock).mockResolvedValue({ reply: 'hi' });
    const req: any = { body: { messages: [{ role: 'user', content: 'hi' }] } };
    const res = mockRes();

    await chat(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, reply: 'hi' }));
  });

  it('chat validates the request body', async () => {
    const req: any = { body: { messages: [{ role: 'user', content: '' }] } };
    const res = mockRes();
    const next = jest.fn();

    await chat(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.anything());
    expect(res.json).not.toHaveBeenCalled();
  });

  it('status returns the agent configuration', async () => {
    (agentService.agentStatus as jest.Mock).mockReturnValue({ enabled: false, provider: 'ollama', model: null });
    const req: any = {};
    const res = mockRes();

    await status(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, enabled: false }));
  });
});
import { StatusCodes } from 'http-status-codes';
import { analyse, list, get, remove } from '../nlp.controller';
import * as nlpService from '../nlp.service';

jest.mock('../nlp.service', () => ({
  analyseText: jest.fn(),
  listAnalyses: jest.fn(),
  getAnalysis: jest.fn(),
  deleteAnalysis: jest.fn(),
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

describe('nlp.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('analyse returns 200 with the classification', async () => {
    (nlpService.analyseText as jest.Mock).mockResolvedValue({
      id: 'a1',
      category: 'đăng nhập / tài khoản',
      priority: 'URGENT',
      sentiment: 'negative',
    });
    const req = mockReq({ body: { text: 'Tôi không đăng nhập được' } });
    const res = mockRes();

    await analyse(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(nlpService.analyseText).toHaveBeenCalledWith('Tôi không đăng nhập được', {
      userId: 'u1',
      projectId: null,
      taskId: null,
      candidates: undefined,
      duplicateThreshold: undefined,
    });
  });

  it('analyse validates the request body', async () => {
    const req = mockReq({ body: { text: '' } });
    const res = mockRes();
    const next = jest.fn();

    await analyse(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.anything());
    expect(res.json).not.toHaveBeenCalled();
  });

  it('list returns the analyses', async () => {
    (nlpService.listAnalyses as jest.Mock).mockResolvedValue([{ id: 'a1' }]);
    const req = mockReq({ query: {} });
    const res = mockRes();

    await list(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('get returns a single analysis', async () => {
    (nlpService.getAnalysis as jest.Mock).mockResolvedValue({ id: 'a1' });
    const req = mockReq({ params: { id: 'a1' } });
    const res = mockRes();

    await get(req, res, jest.fn());

    expect(nlpService.getAnalysis).toHaveBeenCalledWith('u1', 'a1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('remove deletes an analysis', async () => {
    const req = mockReq({ params: { id: 'a1' } });
    const res = mockRes();

    await remove(req, res, jest.fn());

    expect(nlpService.deleteAnalysis).toHaveBeenCalledWith('u1', 'a1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

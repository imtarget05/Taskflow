import { StatusCodes } from 'http-status-codes';
import { search, status } from '../legal.controller';
import * as legalService from '../legal.service';

jest.mock('../legal.service', () => ({
  searchLegal: jest.fn(),
  legalStatus: jest.fn(),
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

describe('legal.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('search returns 200 with the legal answer and citations', async () => {
    (legalService.searchLegal as jest.Mock).mockResolvedValue({
      answer: 'Theo Điều 5...',
      citations: [{ document: 'Bộ luật Lao động 2019', article: 'Điều 5', url: 'https://x' }],
      disclaimer: 'Tham khảo',
      modelUsed: 'qwen',
      cached: false,
    });
    const req = mockReq({ body: { question: 'Lương tối thiểu vùng là bao nhiêu?' } });
    const res = mockRes();

    await search(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, answer: 'Theo Điều 5...' })
    );
    expect(legalService.searchLegal).toHaveBeenCalledWith('u1', 'Lương tối thiểu vùng là bao nhiêu?');
  });

  it('search validates the question body', async () => {
    const req = mockReq({ body: { question: '' } });
    const res = mockRes();
    const next = jest.fn();

    await search(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.anything());
    expect(legalService.searchLegal).not.toHaveBeenCalled();
  });

  it('status returns the legal research status', async () => {
    (legalService.legalStatus as jest.Mock).mockResolvedValue({
      enabled: true,
      indexedDocuments: 42,
      indexedChunks: 1337,
    });
    const req = mockReq();
    const res = mockRes();

    await status(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, enabled: true, indexedDocuments: 42 })
    );
  });
});
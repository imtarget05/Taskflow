import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import * as projectController from '../project.controller';

jest.mock('../../project/project.service', () => ({
  createProject: jest.fn(),
  listProjects: jest.fn(),
  getProject: jest.fn(),
  updateProject: jest.fn(),
  deleteProject: jest.fn(),
  addMember: jest.fn(),
  removeMember: jest.fn(),
  listMembers: jest.fn(),
}));

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

function makeReq(params: Record<string, string> = {}, body: unknown = {}): Request {
  return { params, body, user: { id: 'u1', email: 'a@b.com', name: 'A' } } as unknown as Request;
}

async function expectValidationError(
  handler: (req: Request, res: Response, next: (...args: unknown[]) => unknown) => unknown,
  req: Request,
  res: Response
) {
  const next = jest.fn();
  await handler(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: StatusCodes.BAD_REQUEST }));
}

describe('project.controller validation', () => {
  it('rejects unknown project ids with field-level details', async () => {
    await expectValidationError(projectController.getById, makeReq({ projectId: '' }), makeRes());
  });

  it('rejects invalid member data', async () => {
    await expectValidationError(
      projectController.addMember,
      makeReq({ projectId: 'p1' }, { email: 'not-an-email' }),
      makeRes()
    );
  });

  it('rejects invalid member removal ids', async () => {
    await expectValidationError(
      projectController.removeMember,
      makeReq({ projectId: 'p1', userId: '' }),
      makeRes()
    );
  });

  it('rejects invalid project id when listing members', async () => {
    await expectValidationError(projectController.members, makeReq({ projectId: '' }), makeRes());
  });
});
import { prisma } from '../../../lib/prisma';
import { mcpTools, callTool } from '../mcp.tools';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    projectMember: { findMany: jest.fn(), findFirst: jest.fn() },
    project: { findUnique: jest.fn() },
    task: { findMany: jest.fn(), create: jest.fn(), aggregate: jest.fn() },
    column: { findFirst: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  projectMember: { findMany: jest.Mock; findFirst: jest.Mock };
  project: { findUnique: jest.Mock };
  task: { findMany: jest.Mock; create: jest.Mock; aggregate: jest.Mock };
  column: { findFirst: jest.Mock };
};

const ctx = { userId: 'u1' };

describe('MCP tools', () => {
  beforeEach(() => jest.clearAllMocks());

  it('listProjects trả về project của user với taskCount', async () => {
    mockedPrisma.projectMember.findMany.mockResolvedValue([
      { project: { id: 'p1', name: 'Board', description: null, color: '#fff', _count: { tasks: 3 } } },
    ]);
    const out = await mcpTools.listProjects(ctx);
    expect(out).toEqual([{ id: 'p1', name: 'Board', description: null, color: '#fff', taskCount: 3 }]);
  });

  it('listTasks từ chối khi không phải thành viên (403)', async () => {
    mockedPrisma.projectMember.findFirst.mockResolvedValue(null);
    mockedPrisma.project.findUnique.mockResolvedValue({ ownerId: 'other' });
    await expect(mcpTools.listTasks(ctx, { projectId: 'p1' })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('createTask đặt task vào column đầu tiên, position = max+1', async () => {
    mockedPrisma.projectMember.findFirst.mockResolvedValue({ id: 'm1' });
    mockedPrisma.column.findFirst.mockResolvedValue({ id: 'col1' });
    mockedPrisma.task.aggregate.mockResolvedValue({ _max: { position: 4 } });
    mockedPrisma.task.create.mockResolvedValue({ id: 't9', title: 'Mới', priority: 'HIGH' });

    const task = await mcpTools.createTask(ctx, { projectId: 'p1', title: 'Mới', priority: 'HIGH' });
    expect(task.id).toBe('t9');
    expect(mockedPrisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ columnId: 'col1', position: 5, createdById: 'u1' }),
      })
    );
  });

  it('callTool dispatch đúng và 404 với tool lạ', async () => {
    mockedPrisma.projectMember.findMany.mockResolvedValue([]);
    await callTool('list_projects', {}, ctx);
    expect(mockedPrisma.projectMember.findMany).toHaveBeenCalled();

    await expect(callTool('nope', {}, ctx)).rejects.toMatchObject({ statusCode: 404 });
  });
});

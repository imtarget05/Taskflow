import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { retrieve } from '../rag/rag.service';

/**
 * MCP (Model Context Protocol) tools cho TaskFlow.
 *
 * Các tool handler tách khỏi transport (stdio/HTTP) để unit-test được.
 * Auth: MCP chạy ngoài session cookie — mỗi tool nhận `userId` được resolve
 * từ MCP token ở tầng transport (scripts/mcp-server.ts).
 */

export interface McpContext {
  userId: string;
}

export const mcpTools = {
  async listProjects(ctx: McpContext) {
    const memberships = await prisma.projectMember.findMany({
      where: { userId: ctx.userId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true,
            _count: { select: { tasks: true } },
          },
        },
      },
    });
    return memberships.map((m) => ({
      id: m.project.id,
      name: m.project.name,
      description: m.project.description,
      color: m.project.color,
      taskCount: m.project._count.tasks,
    }));
  },

  async listTasks(ctx: McpContext, args: { projectId: string }) {
    await assertProjectAccess(ctx.userId, args.projectId);
    const tasks = await prisma.task.findMany({
      where: { projectId: args.projectId },
      orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }],
      take: 50,
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        dueDate: true,
        completed: true,
        column: { select: { name: true } },
      },
    });
    return tasks.map((t) => ({ ...t, column: t.column.name }));
  },

  async createTask(
    ctx: McpContext,
    args: { projectId: string; title: string; description?: string; priority?: string }
  ) {
    await assertProjectAccess(ctx.userId, args.projectId);
    const firstColumn = await prisma.column.findFirst({
      where: { projectId: args.projectId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    if (!firstColumn) {
      throw new AppError('Project chưa có column nào', StatusCodes.BAD_REQUEST);
    }
    const maxPos = await prisma.task.aggregate({
      where: { columnId: firstColumn.id },
      _max: { position: true },
    });
    const task = await prisma.task.create({
      data: {
        projectId: args.projectId,
        columnId: firstColumn.id,
        title: args.title,
        description: args.description ?? null,
        priority: (args.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') ?? 'MEDIUM',
        position: (maxPos._max.position ?? -1) + 1,
        createdById: ctx.userId,
      },
      select: { id: true, title: true, priority: true },
    });
    return task;
  },

  async searchTasks(_ctx: McpContext, args: { query: string; limit?: number }) {
    const tasks = await prisma.task.findMany({
      where: {
        OR: [{ title: { contains: args.query, mode: 'insensitive' as const } }],
      },
      take: Math.min(args.limit ?? 10, 20),
      select: {
        id: true,
        title: true,
        priority: true,
        completed: true,
        project: { select: { id: true, name: true } },
      },
    });
    return tasks;
  },

  async ragSearch(ctx: McpContext, args: { query: string; projectId?: string; topK?: number }) {
    return retrieve(ctx.userId, args.query, {
      projectId: args.projectId,
      topK: args.topK,
    });
  },
};

async function assertProjectAccess(userId: string, projectId: string): Promise<void> {
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: { id: true },
  });
  if (member) return;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project || project.ownerId !== userId) {
    throw new AppError('Bạn không có quyền truy cập project này', StatusCodes.FORBIDDEN);
  }
}

/** JSON Schema cho từng tool (dùng bởi MCP server transport). */
export const mcpToolDefinitions = [
  {
    name: 'list_projects',
    description: 'Liệt kê các project mà user hiện tại là thành viên',
    inputSchema: { type: 'object', properties: {}, required: [] as string[] },
  },
  {
    name: 'list_tasks',
    description: 'Liệt kê tối đa 50 task của một project (cần quyền thành viên)',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string', description: 'ID project' } },
      required: ['projectId'],
    },
  },
  {
    name: 'create_task',
    description: 'Tạo task mới ở column đầu tiên của project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
      },
      required: ['projectId', 'title'],
    },
  },
  {
    name: 'search_tasks',
    description: 'Tìm task theo tiêu đề trên toàn hệ thống',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', description: 'Mặc định 10, tối đa 20' },
      },
      required: ['query'],
    },
  },
  {
    name: 'rag_search',
    description: 'Hybrid retrieval (semantic + keyword, RRF) trên rag_chunks của dự án',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        projectId: { type: 'string' },
        topK: { type: 'number' },
      },
      required: ['query'],
    },
  },
] as const;

/**
 * Dispatch tên tool → handler. Dùng bởi MCP transport; lỗi AppError được map
 * thành message dạng text để client MCP hiển thị.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: McpContext
): Promise<unknown> {
  const a = args as never;
  switch (name) {
    case 'list_projects':
      return mcpTools.listProjects(ctx);
    case 'list_tasks':
      return mcpTools.listTasks(ctx, a);
    case 'create_task':
      return mcpTools.createTask(ctx, a);
    case 'search_tasks':
      return mcpTools.searchTasks(ctx, a);
    case 'rag_search':
      return mcpTools.ragSearch(ctx, a);
    default:
      throw new AppError(`Tool không tồn tại: ${name}`, StatusCodes.NOT_FOUND);
  }
}


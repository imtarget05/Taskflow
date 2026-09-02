import { z } from 'zod';
import { TaskPriority } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createProject } from '../project/project.service';
import { createTask, updateTask } from '../task/task.service';
import { AppError } from '../../utils/errors';
import { ToolRegistry, ToolDefinition, ToolContext } from './tool-registry';

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  color: z.string().max(20).optional(),
});

const createTaskSchema = z.object({
  projectName: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(500),
  columnName: z.string().max(120).optional(),
  description: z.string().max(4000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.string().optional(),
});

const getProjectSchema = z.object({
  projectName: z.string().trim().min(1).max(120),
});

const moveTaskSchema = z.object({
  taskId: z.string().trim().min(1),
  targetColumnName: z.string().trim().min(1).max(120),
});

const searchTasksSchema = z.object({
  keyword: z.string().trim().min(1).max(200),
  projectName: z.string().trim().min(1).max(120).optional(),
});

function firstZodIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'dữ liệu không hợp lệ';
}

export function createAgentToolsRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  const createProjectTool: ToolDefinition = {
    name: 'create_project',
    description:
      "Create a new project/board (the top-level entity; also what a user calls a 'workspace'). Adds the current user as its owner. Only call this after the user has explicitly confirmed creation.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project/board name' },
        description: { type: 'string', description: 'Optional description' },
        color: { type: 'string', description: 'Optional color hex or keyword' },
      },
      required: ['name'],
    },
    handler: async (params, context: ToolContext) => {
      const p = createProjectSchema.safeParse(params);
      if (!p.success) {
        return { success: false, error: `Không thể tạo: ${firstZodIssue(p.error)}` };
      }
      try {
        const created = await createProject(context.userId, p.data);
        return { success: true, data: { id: created.id, name: p.data.name } };
      } catch (err) {
        const msg = err instanceof AppError ? err.message : 'lỗi không xác định';
        return { success: false, error: `Không thể thực hiện: ${msg}` };
      }
    },
  };

  const createTaskTool: ToolDefinition = {
    name: 'create_task',
    description:
      "Create a task in an existing project/board that the user is a member of, addressed by its name. Only call this after the user has explicitly confirmed creation.",
    parameters: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Name of the existing project/board' },
        title: { type: 'string', description: 'Task title' },
        columnName: { type: 'string', description: 'Optional column name' },
        description: { type: 'string', description: 'Optional task description' },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
        dueDate: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['projectName', 'title'],
    },
    handler: async (params, context: ToolContext) => {
      const p = createTaskSchema.safeParse(params);
      if (!p.success) {
        return { success: false, error: `Không thể tạo task: ${firstZodIssue(p.error)}` };
      }
      try {
        const project = await prisma.projectMember.findFirst({
          where: { userId: context.userId, project: { name: p.data.projectName } },
          select: { project: { select: { id: true } } },
        });
        if (!project) {
          return {
            success: false,
            error: `Không tìm thấy board "${p.data.projectName}" mà bạn là thành viên.`,
          };
        }
        const projectId = project.project.id;
        let column = null;
        if (p.data.columnName) {
          column = await prisma.column.findFirst({ where: { projectId, name: p.data.columnName } });
        }
        if (!column) {
          column = await prisma.column.findFirst({ where: { projectId }, orderBy: { position: 'asc' } });
        }
        if (!column) {
          return { success: false, error: 'Board không có cột nào để thêm task.' };
        }
        await createTask(context.userId, {
          projectId,
          columnId: column.id,
          title: p.data.title,
          ...(p.data.description !== undefined ? { description: p.data.description } : {}),
          ...(p.data.priority !== undefined ? { priority: p.data.priority as TaskPriority } : {}),
          ...(p.data.dueDate !== undefined ? { dueDate: p.data.dueDate } : {}),
        });
        return { success: true, data: { title: p.data.title, projectName: p.data.projectName, columnName: column.name } };
      } catch (err) {
        const msg = err instanceof AppError ? err.message : 'lỗi không xác định';
        return { success: false, error: `Không thể thực hiện: ${msg}` };
      }
    },
  };

  const listProjectsTool: ToolDefinition = {
    name: 'list_projects',
    description: "List all projects/boards that the user is a member of.",
    parameters: { type: 'object', properties: {} },
    handler: async (_params, context: ToolContext) => {
      try {
        const memberships = await prisma.projectMember.findMany({
          where: { userId: context.userId },
          include: {
            project: {
              select: { id: true, name: true, description: true, color: true, createdAt: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
        const projects = memberships.map((m) => m.project);
        return { success: true, data: projects };
      } catch (err) {
        const msg = err instanceof AppError ? err.message : 'lỗi không xác định';
        return { success: false, error: `Không thể lấy danh sách board: ${msg}` };
      }
    },
  };

  const getProjectTool: ToolDefinition = {
    name: 'get_project',
    description: "Get details of a specific project/board by name, including columns and tasks.",
    parameters: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Name of the project/board' },
      },
      required: ['projectName'],
    },
    handler: async (params, context: ToolContext) => {
      const p = getProjectSchema.safeParse(params);
      if (!p.success) {
        return { success: false, error: firstZodIssue(p.error) };
      }
      try {
        const project = await prisma.project.findFirst({
          where: { name: p.data.projectName },
          include: {
            columns: {
              orderBy: { position: 'asc' },
              include: {
                tasks: {
                  orderBy: { position: 'asc' },
                  include: { assignments: { include: { user: { select: { id: true, name: true } } } } },
                },
              },
            },
            members: { include: { user: { select: { id: true, name: true, email: true } } } },
          },
        });
        if (!project) {
          return { success: false, error: `Không tìm thấy board "${p.data.projectName}".` };
        }
        const membership = project.members.find((m) => m.userId === context.userId);
        if (!membership) {
          return { success: false, error: `Bạn không phải thành viên của board "${p.data.projectName}".` };
        }
        return { success: true, data: project };
      } catch (err) {
        const msg = err instanceof AppError ? err.message : 'lỗi không xác định';
        return { success: false, error: `Không thể lấy thông tin board: ${msg}` };
      }
    },
  };

  const moveTaskTool: ToolDefinition = {
    name: 'move_task',
    description: 'Move a task to a different column in the same project.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task to move' },
        targetColumnName: { type: 'string', description: 'Name of the destination column' },
      },
      required: ['taskId', 'targetColumnName'],
    },
    handler: async (params, context: ToolContext) => {
      const p = moveTaskSchema.safeParse(params);
      if (!p.success) {
        return { success: false, error: firstZodIssue(p.error) };
      }
      try {
        const task = await prisma.task.findUnique({ where: { id: p.data.taskId } });
        if (!task) {
          return { success: false, error: 'Không tìm thấy task.' };
        }
        const targetColumn = await prisma.column.findFirst({
          where: { projectId: task.projectId, name: p.data.targetColumnName },
        });
        if (!targetColumn) {
          return { success: false, error: `Không tìm thấy cột "${p.data.targetColumnName}".` };
        }
        await updateTask(context.userId, task.projectId, p.data.taskId, { columnId: targetColumn.id });
        return { success: true, data: { taskId: p.data.taskId, columnName: p.data.targetColumnName } };
      } catch (err) {
        const msg = err instanceof AppError ? err.message : 'lỗi không xác định';
        return { success: false, error: `Không thể di chuyển task: ${msg}` };
      }
    },
  };

  const searchTasksTool: ToolDefinition = {
    name: 'search_tasks',
    description: 'Search tasks by keyword in title or description, optionally scoped to a project.',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Search keyword' },
        projectName: { type: 'string', description: 'Optional project name to scope the search' },
      },
      required: ['keyword'],
    },
    handler: async (params, context: ToolContext) => {
      const p = searchTasksSchema.safeParse(params);
      if (!p.success) {
        return { success: false, error: firstZodIssue(p.error) };
      }
      try {
        let projectId: string | undefined;
        if (p.data.projectName) {
          const membership = await prisma.projectMember.findFirst({
            where: { userId: context.userId, project: { name: p.data.projectName } },
            select: { project: { select: { id: true } } },
          });
          if (!membership) {
            return { success: false, error: `Không tìm thấy board "${p.data.projectName}".` };
          }
          projectId = membership.project.id;
        }
        const tasks = await prisma.task.findMany({
          where: {
            ...(projectId ? { projectId } : {}),
            OR: [
              { title: { contains: p.data.keyword, mode: 'insensitive' } },
              { description: { contains: p.data.keyword, mode: 'insensitive' } },
            ],
            ...(projectId ? {} : { project: { members: { some: { userId: context.userId } } } }),
          },
          include: {
            column: { select: { name: true } },
            project: { select: { name: true } },
          },
          take: 20,
        });
        return { success: true, data: tasks };
      } catch (err) {
        const msg = err instanceof AppError ? err.message : 'lỗi không xác định';
        return { success: false, error: `Không thể tìm kiếm: ${msg}` };
      }
    },
  };

  registry.register(createProjectTool);
  registry.register(createTaskTool);
  registry.register(listProjectsTool);
  registry.register(getProjectTool);
  registry.register(moveTaskTool);
  registry.register(searchTasksTool);

  return registry;
}

export const agentToolsRegistry = createAgentToolsRegistry();

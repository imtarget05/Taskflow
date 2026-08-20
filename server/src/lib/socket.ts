import type { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { verifyAccessToken } from '../utils/token';

/**
 * Socket.io server wrapper. Exposes the io instance for use in
 * route handlers to emit realtime events (board updates, activities, etc).
 */
let io: Server | null = null;

export const SOCKET_EVENTS = {
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_DELETED: 'task:deleted',
  TASK_MOVED: 'task:moved',
  COMMENT_ADDED: 'comment:added',
  ACTIVITY_CREATED: 'activity:created',
  COLUMN_CREATED: 'column:created',
  COLUMN_UPDATED: 'column:updated',
  COLUMN_DELETED: 'column:deleted',
  MEMBER_ADDED: 'member:added',
  MEMBER_REMOVED: 'member:removed',
  CHAT_GROUP_CREATED: 'chat:group-created',
  CHAT_MESSAGE: 'chat:message',
  CHAT_READ: 'chat:read',
} as const;

export function initSocket(server: HTTPServer): Server {
  io = new Server(server, {
    cors: {
      origin: env.CORS_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      if (!cookieHeader) {
        return next(new Error('Authentication error: Missing token'));
      }
      const cookies = cookieHeader.split(';').reduce((acc, entry) => {
        const separator = entry.indexOf('=');
        if (separator < 0) return acc;
        const name = entry.slice(0, separator).trim();
        const value = entry.slice(separator + 1).trim();
        acc[name] = decodeURIComponent(value);
        return acc;
      }, {} as Record<string, string>);
      const accessToken = cookies.access_token;
      if (!accessToken) {
        return next(new Error('Authentication error: Missing access_token cookie'));
      }
      const payload = verifyAccessToken(accessToken);
      if (payload.type !== 'access') return next(new Error('Authentication error: Invalid token type'));
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('board:join', async (payload, ack) => {
      try {
        const { projectId } = payload ?? {};
        if (!projectId || typeof projectId !== 'string') {
          ack?.({ ok: false, error: 'Missing projectId' });
          return;
        }
        // Check membership in DB before joining room
        const membership = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: socket.data.userId! } },
        });
        if (!membership) {
          ack?.({ ok: false, error: 'You are not a member of this project' });
          return;
        }
        if (io) {
          await socket.join(`project:${projectId}`);
          ack?.({ ok: true });
        }
      } catch {
        ack?.({ ok: false, error: 'Invalid payload' });
      }
    });

    socket.on('board:leave', (payload) => {
      if (payload?.projectId) {
        void socket.leave(`project:${payload.projectId}`);
      }
    });

  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io has not been initialized');
  }
  return io;
}

export function emitToProject(projectId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`project:${projectId}`).emit(event, data);
  }
}

export function closeSocket(): Promise<void> {
  return new Promise((resolve) => {
    if (!io) return resolve();
    io.close(() => resolve());
    io = null;
  });
}

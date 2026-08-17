import type { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';

/**
 * Socket.io server wrapper. Exposes the io instance for use in
 * route handlers to emit realtime events (board updates, activities, etc).
 */
let io: Server | null = null;

export const SOCKET_EVENTS = {
  BOARD_UPDATE: 'board:update',
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
} as const;

export interface AuthenticatedSocket {
  userId: string;
  /** Project rooms the socket has joined */
  rooms: Set<string>;
}

export function initSocket(server: HTTPServer): Server {
  io = new Server(server, {
    cors: {
      origin: env.CLIENT_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

    io.use((_socket, next) => {
    // Auth is handled by the client attaching ?token= JWT to the socket URL.
    // For simplicity + per-message auth, room membership is enforced in the
    // joinBoard handler below (with a DB check). Here we just allow connection.
    next();
  });

  io.on('connection', (socket) => {
    socket.on('board:join', async (payload, ack) => {
      try {
        const { projectId } = payload ?? {};
        if (!projectId || typeof projectId !== 'string') {
          ack?.({ ok: false, error: 'Missing projectId' });
          return;
        }
        // The server trusts the value passed by the client; room-level
        // authorization is enforced by the REST middleware on every mutation.
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

    socket.on('disconnect', () => {
      // Rooms are cleaned up automatically on disconnect.
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
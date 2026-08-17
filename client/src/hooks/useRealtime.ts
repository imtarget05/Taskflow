import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '@/lib/api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000';

/**
 * Establishes a singleton Socket.io connection and joins the board room for the
 * given project. Individually connect to the server when the board mounts.
 */
export function useRealtime(projectId: string | undefined) {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!projectId) return;

    // Reuse an existing connection or create one.
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, {
        auth: { token: getAccessToken() },
        transports: ['websocket'],
      });
    }
    const socket = socketRef.current;

    // Join the project room.
    socket.emit('board:join', { projectId });

    const refreshBoard = () =>
      qc.invalidateQueries({ queryKey: ['board', projectId] });
    const refreshActivities = () =>
      qc.invalidateQueries({ queryKey: ['activities', projectId] });

    socket.on('board:update', refreshBoard);
    socket.on('task:created', refreshBoard);
    socket.on('task:updated', refreshBoard);
    socket.on('task:moved', refreshBoard);
    socket.on('task:deleted', refreshBoard);
    socket.on('comment:added', refreshBoard);
    socket.on('column:created', refreshBoard);
    socket.on('column:updated', refreshBoard);
    socket.on('column:deleted', refreshBoard);
    socket.on('activity:created', refreshActivities);

    return () => {
      socket.emit('board:leave', { projectId });
      // Remove listeners bound to this hook.
      socket.off('board:update', refreshBoard);
      socket.off('task:created', refreshBoard);
      socket.off('task:updated', refreshBoard);
      socket.off('task:moved', refreshBoard);
      socket.off('task:deleted', refreshBoard);
      socket.off('comment:added', refreshBoard);
      socket.off('column:created', refreshBoard);
      socket.off('column:updated', refreshBoard);
      socket.off('column:deleted', refreshBoard);
      socket.off('activity:created', refreshActivities);
    };
  }, [projectId, qc]);

  return socketRef.current;
}
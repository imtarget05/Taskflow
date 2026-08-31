import { TaskPriority } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { emitToProject, SOCKET_EVENTS } from '../../../lib/socket';
import {
  APPROVAL_SLA_STEPS_MS,
  computeApprovalEscalation,
  escalateStaleHumanTasks,
} from '../agentic.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: { task: { findMany: jest.fn(), update: jest.fn() } },
}));

jest.mock('../../../lib/socket', () => ({
  emitToProject: jest.fn(),
  SOCKET_EVENTS: { TASK_UPDATED: 'task:updated' },
}));

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-08-31T12:00:00Z');

describe('approval escalation policy — khi không thể duyệt bằng tay', () => {
  it('SLA steps là 24h / 48h / 72h', () => {
    expect(APPROVAL_SLA_STEPS_MS).toEqual([24 * HOUR, 48 * HOUR, 72 * HOUR]);
  });

  it('chưa quá hạn (< 24h) → chờ, không escalation', () => {
    const r = computeApprovalEscalation(new Date(NOW.getTime() - 23 * HOUR), NOW);
    expect(r.level).toBe(0);
    expect(r.action).toBe('wait');
  });

  it('quá hạn 24h → nhắc lại (notify_again)', () => {
    const r = computeApprovalEscalation(new Date(NOW.getTime() - 24 * HOUR), NOW);
    expect(r.level).toBe(1);
    expect(r.action).toBe('notify_again');
    expect(r.message).toContain('quá hạn');
  });

  it('quá hạn 48h → nâng độ ưu tiên (escalate_priority)', () => {
    const r = computeApprovalEscalation(new Date(NOW.getTime() - 48 * HOUR), NOW);
    expect(r.level).toBe(2);
    expect(r.action).toBe('escalate_priority');
  });

  it('quá hạn 72h → chặn order (block_order)', () => {
    const r = computeApprovalEscalation(new Date(NOW.getTime() - 72 * HOUR), NOW);
    expect(r.level).toBe(3);
    expect(r.action).toBe('block_order');
  });

  it.each([
    ['24h', 24 * HOUR],
    ['48h', 48 * HOUR],
    ['72h', 72 * HOUR],
  ])('boundary %s đúng ngưỡng (>= tính là quá hạn)', (_n, age) => {
    const r = computeApprovalEscalation(new Date(NOW.getTime() - age), NOW);
    expect(r.level).toBeGreaterThanOrEqual(1);
  });

  it('GUARDRAIL: escalation KHÔNG BAO GIỜ tự động phê duyệt', () => {
    for (const age of [0, 1, 24, 48, 72, 100, 1000].map((h) => h * HOUR)) {
      const r = computeApprovalEscalation(new Date(NOW.getTime() - age), NOW);
      expect(r.action).not.toContain('approve');
      expect(r.action).not.toContain('auto');
    }
  });
});
describe('escalateStaleHumanTasks — executor quét task chờ duyệt quá hạn', () => {
  const projectId = 'p1';
  const actorId = 'u1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('quét đúng các task requiresHumanApproval chưa hoàn thành', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    await escalateStaleHumanTasks(projectId, actorId, NOW);
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId, completed: false }),
      })
    );
  });

  it('task quá hạn 25h → update metadata escalationLevel=1 + emit socket', async () => {
    const stale = {
      id: 't1',
      projectId,
      title: 'Xác nhận phê duyệt thanh toán PO-1',
      priority: TaskPriority.URGENT,
      completed: false,
      metadata: { requiresHumanApproval: true, actionType: 'approve_payment', orderId: 'o1' },
      createdAt: new Date(NOW.getTime() - 25 * HOUR),
    };
    (prisma.task.findMany as jest.Mock).mockResolvedValue([stale]);
    (prisma.task.update as jest.Mock).mockResolvedValue({ ...stale, metadata: {} });

    const summary = await escalateStaleHumanTasks(projectId, actorId, NOW);

    expect(summary).toEqual({ checked: 1, escalated: 1, blocked: 0 });
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({ escalationLevel: 1, escalationAction: 'notify_again' }),
        }),
      })
    );
    expect(emitToProject).toHaveBeenCalledWith(
      projectId,
      SOCKET_EVENTS.TASK_UPDATED,
      expect.objectContaining({ id: 't1', escalation: expect.objectContaining({ level: 1 }) })
    );
  });

  it('task quá hạn 72h → bị block (blocked=1)', async () => {
    const stale = {
      id: 't2',
      projectId,
      title: 'Review thủ công',
      priority: TaskPriority.HIGH,
      completed: false,
      metadata: { requiresHumanApproval: true, orderId: 'o2' },
      createdAt: new Date(NOW.getTime() - 80 * HOUR),
    };
    (prisma.task.findMany as jest.Mock).mockResolvedValue([stale]);
    (prisma.task.update as jest.Mock).mockResolvedValue(stale);

    const summary = await escalateStaleHumanTasks(projectId, actorId, NOW);
    expect(summary.blocked).toBe(1);
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ escalationAction: 'block_order' }),
        }),
      })
    );
  });

  it('task chưa quá hạn → không update, không emit', async () => {
    const fresh = {
      id: 't3',
      projectId,
      title: 'Mới tạo',
      priority: TaskPriority.URGENT,
      completed: false,
      metadata: { requiresHumanApproval: true },
      createdAt: new Date(NOW.getTime() - 2 * HOUR),
    };
    (prisma.task.findMany as jest.Mock).mockResolvedValue([fresh]);

    const summary = await escalateStaleHumanTasks(projectId, actorId, NOW);
    expect(summary).toEqual({ checked: 1, escalated: 0, blocked: 0 });
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(emitToProject).not.toHaveBeenCalled();
  });

  it('GUARDRAIL: kể cả khi block, metadata KHÔNG BAO GIỜ tự đánh dấu đã duyệt', async () => {
    const stale = {
      id: 't4',
      projectId,
      title: 'Xác nhận giao hàng',
      priority: TaskPriority.URGENT,
      completed: false,
      metadata: { requiresHumanApproval: true, orderId: 'o4' },
      createdAt: new Date(NOW.getTime() - 200 * HOUR),
    };
    (prisma.task.findMany as jest.Mock).mockResolvedValue([stale]);
    (prisma.task.update as jest.Mock).mockResolvedValue(stale);

    await escalateStaleHumanTasks(projectId, actorId, NOW);

    const call = (prisma.task.update as jest.Mock).mock.calls[0][0];
    const metadata = call.data.metadata;
    expect(metadata.requiresHumanApproval).toBe(true); // vẫn cần human
    expect(metadata.autoApproved).toBeUndefined();
    expect(metadata.escalationAction).toBe('block_order');
  });
});


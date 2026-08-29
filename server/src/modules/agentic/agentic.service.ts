import { TaskPriority } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { emitToProject, SOCKET_EVENTS } from '../../lib/socket';
import { createTask, updateTaskMetadata } from '../task/task.service';
import { AnalyseOrderResult } from '../supplychain/sc-nlp.service';

export type AgenticDecisionType = 'auto' | 'human_task' | 'manual_review';

export type AgenticAction =
  | { type: 'create_task'; taskTitle: string; targetColumnId?: string; assigneeIds?: string[] }
  | { type: 'move_task'; taskId: string; targetColumnId: string }
  | { type: 'notify'; message: string }
  | { type: 'approve_payment'; orderId: string }
  | { type: 'update_quantity'; orderId: string; newQuantity: number }
  | { type: 'ship_order'; orderId: string }
  | { type: 'manual_review'; reason: string };

export type AgenticDecision = {
  decision: AgenticDecisionType;
  action: AgenticAction;
  confidence: number;
  classification: string;
  reason: string;
};

// High-risk actions that ALWAYS require human task regardless of confidence
const HIGH_RISK_ACTIONS: string[] = [
  'approve_payment',
  'update_quantity',
  'ship_order',
];

// Low-risk actions that can be automated when confidence > 0.7
const LOW_RISK_ACTIONS: string[] = [
  'create_task',
  'move_task',
  'notify',
];

export function isHighRiskAction(action: AgenticAction): boolean {
  return HIGH_RISK_ACTIONS.includes(action.type);
}

export function isLowRiskAction(action: AgenticAction): boolean {
  return LOW_RISK_ACTIONS.includes(action.type);
}

export function evaluateDecision(
  classification: string,
  confidence: number,
  suggestedAction: string,
  workflowTrigger: string,
  orderId?: string
): AgenticDecision {
  const action = buildActionFromSuggestion(suggestedAction, workflowTrigger, orderId);

  if (isHighRiskAction(action)) {
    return {
      decision: 'human_task',
      action,
      confidence,
      classification,
      reason: `Hành động ${action.type} là high-risk, phải có human review bất kể confidence`,
    };
  }

  if (confidence < 0.7) {
    return {
      decision: 'manual_review',
      action: { type: 'manual_review', reason: `Confidence ${confidence.toFixed(2)} < 0.7, cần review thủ công` },
      confidence,
      classification,
      reason: `Confidence thấp (${confidence.toFixed(2)}), cần human review`,
    };
  }

  if (confidence >= 0.7 && isLowRiskAction(action)) {
    return {
      decision: 'auto',
      action,
      confidence,
      classification,
      reason: `Confidence cao (${confidence.toFixed(2)}) + action low-risk → agent tự động`,
    };
  }

  return {
    decision: 'human_task',
    action: { type: 'create_task', taskTitle: `Review: ${suggestedAction}` },
    confidence,
    classification,
    reason: `Không thuộc kondisi auto, fallback human task`,
  };
}

function buildActionFromSuggestion(
  suggestedAction: string,
  workflowTrigger: string,
  orderId?: string
): AgenticAction {
  switch (workflowTrigger) {
    case 'approve_po':
      return { type: 'create_task', taskTitle: `Phê duyệt PO: ${suggestedAction}` };
    case 'update_po':
      return { type: 'create_task', taskTitle: `Xác nhận điều chỉnh PO: ${suggestedAction}` };
    case 'invoice_verify':
      // Thanh toán hóa đơn là high-risk → luôn đi qua human approval.
      // Truyền orderId thực tế để task có thể link về đơn hàng gốc.
      return { type: 'approve_payment', orderId: orderId ?? '' };
    case 'asn_check':
      return { type: 'create_task', taskTitle: `Kiểm tra hàng nhập (ASN): ${suggestedAction}` };
    default:
      return { type: 'create_task', taskTitle: `Xử lý: ${suggestedAction}` };
  }
}

// Resolve SC workflow column cho việc tạo task.
// Ưu tiên column theo tên (mặc định "PO Received"), fallback về column đầu tiên của project.
export async function resolveSCColumnId(projectId: string, preferredName = 'PO Received'): Promise<string> {
  const columns = await prisma.column.findMany({
    where: { projectId },
    orderBy: { position: 'asc' },
    select: { id: true, name: true },
  });
  if (columns.length === 0) {
    throw new Error(`Project ${projectId} has no columns`);
  }
  const preferred = columns.find((c) => c.name.toLowerCase() === preferredName.toLowerCase());
  return (preferred ?? columns[0]).id;
}

// ---------------------------------------------------------------------------
// Option A-2 — Wire the LangGraph ML agent (Python FastAPI) into the Node flow.
// Best-effort enrichment: pulls the EOQ / reorder suggestion from the deployed
// ML endpoint and stores it on the created task's metadata. Any failure (service
// down, timeout, non-2xx) is swallowed so the core decision flow is unaffected.
// ---------------------------------------------------------------------------
const ML_AGENT_URL = process.env.SC_ML_AGENT_URL ?? 'http://127.0.0.1:8001';

export type MlEoqSuggestion = {
  fetched: boolean;
  eoq?: number;
  safetyStock?: number;
  reorderPoint?: number;
  note: string;
};

export async function fetchMlEoq(orderId: string, orderNumber: string | null): Promise<MlEoqSuggestion> {
  try {
    const res = await fetch(`${ML_AGENT_URL}/inventory/recommended-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demand: 10000, order_cost: 80, holding_cost: 2, lead_time: 5, z_score: 1.65 }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      return { fetched: false, note: `ML agent ${res.status}` };
    }
    const data = (await res.json()) as { eoq?: number; safety_stock?: number; reorder_point?: number };
    return {
      fetched: true,
      eoq: data.eoq,
      safetyStock: data.safety_stock,
      reorderPoint: data.reorder_point,
      note: `langgraph-agent (order ${orderNumber ?? orderId})`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { fetched: false, note: `ML agent unavailable (${msg})` };
  }
}

export async function executeDecision(
  projectId: string,
  actorId: string,
  decision: AgenticDecision,
  orderId: string,
  orderNumber: string | null
): Promise<{ taskId?: string; humanTaskId?: string; notification?: string }> {
  const { decision: decisionType, action } = decision;

  switch (decisionType) {
    case 'auto':
      return await executeAutoAction(projectId, actorId, action, orderId, orderNumber);
    case 'human_task':
      return await createHumanTask(projectId, actorId, action, orderId, orderNumber);
    case 'manual_review':
      return await createManualReviewTask(projectId, actorId, action, orderId, orderNumber);
    default:
      throw new Error(`Unknown decision type: ${decisionType}`);
  }
}

async function executeAutoAction(
  projectId: string,
  actorId: string,
  action: AgenticAction,
  orderId: string,
  orderNumber: string | null
): Promise<{ taskId?: string; notification?: string }> {
  switch (action.type) {
    case 'create_task': {
      const columnId = await resolveSCColumnId(projectId);
      const task = await createTask(actorId, {
        projectId,
        columnId,
        title: action.taskTitle,
        description: `Đơn hàng: ${orderNumber ?? orderId}`,
        priority: TaskPriority.HIGH,
      });
      const eoq = await fetchMlEoq(orderId, orderNumber);
      await updateTaskMetadata(task.id, {
        orderId,
        source: 'agentic',
        mlEoq: eoq.eoq,
        mlSafetyStock: eoq.safetyStock,
        mlReorderPoint: eoq.reorderPoint,
        mlAgent: eoq.note,
      });
      emitToProject(projectId, SOCKET_EVENTS.TASK_CREATED, { ...task, agentic: true, eoq });
      return {
        taskId: task.id,
        notification: `Agent tạo task: ${action.taskTitle}${eoq.fetched ? ` (EOQ ${eoq.eoq} từ LangGraph)` : ''}`,
      };
    }
    case 'notify': {
      emitToProject(projectId, 'sc:agentic:notify', {
        message: action.message,
        orderId,
        orderNumber,
        timestamp: new Date().toISOString(),
      });
      return { notification: action.message };
    }
    case 'move_task': {
      emitToProject(projectId, 'sc:agentic:move_task', {
        taskId: action.taskId,
        targetColumnId: action.targetColumnId,
        orderId,
      });
      return { notification: 'Agent di chuyển task sang column' };
    }
    default:
      return { notification: `Agent thực hiện action: ${action.type}` };
  }
}

async function createHumanTask(
  projectId: string,
  actorId: string,
  action: AgenticAction,
  orderId: string,
  orderNumber: string | null
): Promise<{ humanTaskId: string }> {
  let taskTitle = `Xác nhận hành động: ${action.type}`;
  if (action.type === 'approve_payment') {
    taskTitle = `Xác nhận phê duyệt thanh toán PO ${orderNumber ?? orderId}`;
  } else if (action.type === 'update_quantity') {
    taskTitle = `Xác nhận điều chỉnh số lượng đơn hàng ${orderNumber ?? orderId}`;
  } else if (action.type === 'ship_order') {
    taskTitle = `Xác nhận giao hàng đơn hàng ${orderNumber ?? orderId}`;
  }

  const task = await createTask(actorId, {
    projectId,
    columnId: await resolveSCColumnId(projectId),
    title: taskTitle,
    description: `Hành động cần human xác nhận. Đơn hàng: ${orderNumber ?? orderId}. Action: ${action.type}`,
    priority: TaskPriority.URGENT,
    assigneeIds: [],
  });

  await updateTaskMetadata(task.id, {
    orderId,
    source: 'agentic',
    actionType: action.type,
    requiresHumanApproval: true,
  });

  emitToProject(projectId, SOCKET_EVENTS.TASK_CREATED, { ...task, agentic: true, requiresHumanApproval: true });

  return { humanTaskId: task.id };
}

async function createManualReviewTask(
  projectId: string,
  actorId: string,
  action: AgenticAction,
  orderId: string,
  orderNumber: string | null
): Promise<{ humanTaskId: string }> {
  const task = await createTask(actorId, {
    projectId,
    columnId: await resolveSCColumnId(projectId),
    title: `Review thủ công: ${action.type === 'manual_review' ? action.reason : 'Nhuận lý'}`,
    description: `Confidence thấp hoặc classification không rõ ràng. Đơn hàng: ${orderNumber ?? orderId}`,
    priority: TaskPriority.HIGH,
  });

  await updateTaskMetadata(task.id, {
    orderId,
    source: 'agentic',
    actionType: 'manual_review',
    requiresHumanApproval: true,
  });

  emitToProject(projectId, SOCKET_EVENTS.TASK_CREATED, { ...task, agentic: true, requiresHumanApproval: true });

  return { humanTaskId: task.id };
}

export function ruleBasedFallbackForAgent(text: string): AnalyseOrderResult {
  // Lưu ý: không dùng \b cuối pattern vì \b của JS là ASCII-based — sẽ fail
  // khi đứng ngay sau ký tự tiếng Việt có dấu (vd: "số", "hàng").
  const RULES = [
    {
      type: 'PO_NEW',
      patterns: /(^|\s)(po\s*số|po\s*number|purchase\s*order|đặt\s*hàng|yêu\s*cầu\s*mua|new\s*po|po\s*new)/i,
      action: 'phê duyệt PO',
      trigger: 'approve_po',
    },
    {
      type: 'PO_UPDATE',
      patterns: /(^|\s)(cập\s*nhật\s*po|update\s*po|điều\s*chỉnh\s*po|po\s*cập\s*nhật|tăng\s*giảm\s*quantity|quantity\s*change|po\s*update|annotation)/i,
      action: 'xác nhận điều chỉnh PO',
      trigger: 'update_po',
    },
    {
      type: 'INVOICE',
      patterns: /(^|\s)(hóa\s*đơn|invoice|inv\s*-?\s*\d|thanh\s*toán|giá\s*tổng|vat)/i,
      action: 'gửi cho bộ phận kế toán',
      trigger: 'invoice_verify',
    },
    {
      type: 'ASN',
      patterns: /(^|\s)(asn|advanced\s*shipping\s*notice|shipment|eta\s*\d|gửi\s*hàng|đang\s*shipping|shipping\s*notice)/i,
      action: 'kiểm tra hàng nhập',
      trigger: 'asn_check',
    },
  ];

  for (const rule of RULES) {
    if (rule.patterns.test(text)) {
      return {
        classification: rule.type,
        confidence: 0.8,
        suggestedAction: rule.action,
        workflowTrigger: rule.trigger,
        llmUsed: false,
      };
    }
  }

  return {
    classification: 'UNKNOWN',
    confidence: 0.5,
    suggestedAction: 'xác định loại tài liệu',
    workflowTrigger: 'manual_review',
    llmUsed: false,
  };
}

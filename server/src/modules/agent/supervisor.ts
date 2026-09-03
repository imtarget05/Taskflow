import { chat } from './agent.service';
import { prisma } from '../../lib/prisma';
import { assertRole } from '../project/project.service';
import { recordError } from './metrics';
import { withCircuitBreaker, isOpen } from '../../lib/circuit-breaker';
import { Role } from '@prisma/client';

export type AgentRoute = 'chat' | 'sc_agentic' | 'ml_agent';

export interface RouteResult {
  agent: AgentRoute;
  reason: string;
}

const SC_KEYWORDS = [
  'đơn hàng', 'po', 'purchase order', 'invoice', 'asn', 'supply chain',
  'xếp hàng', 'giao hàng', 'thanh toán', 'phê duyệt', 'order',
  'tạo đơn', 'chỉnh sửa đơn', 'hủy đơn', 'ship', 'giao',
];
const ML_KEYWORDS = [
  'eoq', 'reorder', 'stock', 'tồn kho', 'tái đặt hàng', 'forecast',
  'dự báo', 'điểm đặt lại', 'số lượng đặt hàng', 'economic order',
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(text: string, kw: string): boolean {
  const lowerKw = kw.toLowerCase();
  // All keywords use word-boundary to avoid false positives:
  // "po" inside "hypothesis", "order" inside "reorder", "ship" inside "relationship".
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(lowerKw)}(?=[^\\p{L}\\p{N}]|$)`, 'iu');
  return re.test(text);
}

function countMatches(text: string, keywords: string[]): { count: number; matched: string[] } {
  const matched: string[] = [];
  for (const kw of keywords) {
    if (matchesKeyword(text, kw)) matched.push(kw);
  }
  return { count: matched.length, matched };
}

export function route(text: string): RouteResult {
  const t = text.toLowerCase().trim();
  if (!t) return { agent: 'chat', reason: 'Mặc định — câu hỏi quản lý dự án/task' };

  const sc = countMatches(t, SC_KEYWORDS);
  const ml = countMatches(t, ML_KEYWORDS);

  // Prefer the side with more matched keywords; tie → chat if both zero, else higher wins.
  // Using word-boundary for short keywords ensures "reorder" won't count as "order".
  if (ml.count > 0 && ml.count > sc.count) {
    return { agent: 'ml_agent', reason: `Phát hiện từ khóa ML: "${ml.matched[0]}"` };
  }
  if (sc.count > 0 && sc.count >= ml.count) {
    return { agent: 'sc_agentic', reason: `Phát hiện từ khóa SC: "${sc.matched[0]}"` };
  }
  if (ml.count > 0) {
    return { agent: 'ml_agent', reason: `Phát hiện từ khóa ML: "${ml.matched[0]}"` };
  }

  return { agent: 'chat', reason: 'Mặc định — câu hỏi quản lý dự án/task' };
}

export interface ExecutePayload {
  text: string;
  projectId?: string;
}

export interface ExecutedResult {
  agent: AgentRoute;
  reason: string;
  data?: unknown;
}

const SUPERVISOR_TIMEOUT_MS = 3500;
const CUID_RE = /\b(c[a-z0-9]{24,})\b/i;

function extractOrderId(text: string): string | null {
  const m = text.match(CUID_RE);
  return m ? m[1] : null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

async function executeChat(userId: string, payload: ExecutePayload): Promise<unknown> {
  return chat(userId, [{ role: 'user', content: payload.text }], {
    projectId: payload.projectId ?? null,
    skipPersist: false,
  });
}

async function executeScAgentic(userId: string, payload: ExecutePayload): Promise<unknown> {
  const projectId = payload.projectId;
  if (!projectId) {
    throw new Error('projectId là bắt buộc cho SC agentic');
  }
  const orderId = extractOrderId(payload.text) ?? payload.text.trim();
  // Validate cuid shape loosely; if not cuid-like, still attempt but will get 404 from DB.
  // Extract logic ensures free-text isn't silently treated as orderId without hint.

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { supplier: { select: { name: true } } },
  });
  if (!order) {
    // Try lookup by orderNumber as fallback (user may have typed "PO-123")
    const byNumber = await prisma.order.findFirst({
      where: { orderNumber: orderId, projectId },
      include: { supplier: { select: { name: true } } },
    });
    if (!byNumber) throw new Error(`Order not found: ${orderId}`);
    return executeScAgenticOrder(byNumber, projectId, userId);
  }
  if (order.projectId !== projectId) throw new Error('Order does not belong to project');
  return executeScAgenticOrder(order, projectId, userId);
}

async function executeScAgenticOrder(
  order: { id: string; orderNumber: string | null; notes: string | null; projectId: string },
  projectId: string,
  userId: string
): Promise<unknown> {
  await assertRole(projectId, userId, Role.MEMBER);
  const { ruleBasedFallbackForAgent, evaluateDecision, executeDecision } = await import('../agentic/agentic.service');
  const { dispatchToN8n } = await import('../integrations/n8n');
  const text = `${order.orderNumber ?? 'PO'}\n${order.notes ?? ''}`;
  const analysis = ruleBasedFallbackForAgent(text);
  const decision = evaluateDecision(analysis.classification, analysis.confidence, analysis.suggestedAction, analysis.workflowTrigger, order.id);
  const result = await executeDecision(projectId, userId, decision, order.id, order.orderNumber);
  const agenticDecision = await prisma.agenticDecision.create({
    data: {
      orderId: order.id,
      projectId,
      userId,
      classification: analysis.classification,
      confidence: analysis.confidence,
      decision: decision.decision,
      action: JSON.stringify(decision.action),
      taskId: result.taskId ?? null,
      humanTaskId: result.humanTaskId ?? null,
    },
  });
  void dispatchToN8n({
    path: process.env.N8N_WEBHOOK_PATH ?? '/webhook/taskflow-agentic',
    event: 'agentic.decision',
    eventId: agenticDecision.id,
    payload: { agenticDecisionId: agenticDecision.id, orderId: order.id, projectId, userId, classification: analysis.classification, confidence: analysis.confidence, decision: decision.decision, action: decision.action },
  });
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    classification: analysis.classification,
    confidence: analysis.confidence,
    decision: decision.decision,
    action: decision.action,
    reason: decision.reason,
    taskId: result.taskId ?? null,
    humanTaskId: result.humanTaskId ?? null,
    agenticDecisionId: agenticDecision.id,
    llmUsed: analysis.llmUsed,
  };
}

async function executeMlAgent(payload: ExecutePayload): Promise<unknown> {
  const { fetchMlEoq } = await import('../agentic/agentic.service');
  const orderId = extractOrderId(payload.text) ?? payload.text.trim().slice(0, 80);
  // fetchMlEoq(orderId, orderNumber) — second arg is orderNumber (nullable), not duplicate
  return fetchMlEoq(orderId, null);
}

export async function execute(
  route: AgentRoute,
  userId: string,
  payload: ExecutePayload
): Promise<ExecutedResult> {
  const breakerKey = `supervisor:${route}`;
  if (isOpen(breakerKey)) {
    recordError(`supervisor_circuit_open_${route}`);
    return { agent: route, reason: `Supervisor circuit OPEN for ${route} — try again shortly`, data: { error: 'Circuit breaker OPEN', route } };
  }

  try {
    if (route === 'chat') {
      const data = await withCircuitBreaker(breakerKey, () => withTimeout(executeChat(userId, payload), SUPERVISOR_TIMEOUT_MS, 'chat'), { failureThreshold: 5 });
      return { agent: 'chat', reason: 'Chat agent processed', data };
    }
    if (route === 'sc_agentic') {
      const data = await withCircuitBreaker(breakerKey, () => withTimeout(executeScAgentic(userId, payload), SUPERVISOR_TIMEOUT_MS, 'sc_agentic'), { failureThreshold: 5 });
      return { agent: 'sc_agentic', reason: 'SC agentic processed', data };
    }
    if (route === 'ml_agent') {
      const data = await withCircuitBreaker(breakerKey, () => withTimeout(executeMlAgent(payload), 4000, 'ml_agent'), { failureThreshold: 3 });
      return { agent: 'ml_agent', reason: 'ML agent processed', data };
    }
    return { agent: route, reason: `Routed to ${route}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordError(`supervisor_execute_failed_${route}`);
    return { agent: route, reason: `Supervisor error for ${route}`, data: { error: message, route } };
  }
}
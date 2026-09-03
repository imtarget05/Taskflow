import { chat } from './agent.service';
import { processOrder } from '../agentic/agentic.controller';
import { Request, Response } from 'express';

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

export function route(text: string): RouteResult {
  const t = text.toLowerCase().trim();

  for (const kw of SC_KEYWORDS) {
    if (t.includes(kw)) {
      return { agent: 'sc_agentic', reason: `Phát hiện từ khóa SC: "${kw}"` };
    }
  }
  for (const kw of ML_KEYWORDS) {
    if (t.includes(kw)) {
      return { agent: 'ml_agent', reason: `Phát hiện từ khóa ML: "${kw}"` };
    }
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

function makeMockReq(userId: string, body: Record<string, unknown>): Request {
  return {
    user: { id: userId },
    body,
  } as Request;
}

function makeMockRes(): Response & { _jsonData?: unknown } {
  const res: Partial<Response & { _jsonData?: unknown }> = {
    status: function (_code: number) { return this as Response; },
    json: function (data: unknown) {
      res._jsonData = data;
      return this as Response;
    },
  };
  return res as Response & { _jsonData?: unknown };
}

export async function execute(
  route: AgentRoute,
  userId: string,
  payload: ExecutePayload
): Promise<ExecutedResult> {
  if (route === 'chat') {
    const result = await chat(userId, [{ role: 'user', content: payload.text }], {
      projectId: payload.projectId ?? null,
      skipPersist: false,
    });
    return { agent: 'chat', reason: 'Chat agent processed', data: result };
  }

  if (route === 'sc_agentic') {
    const req = makeMockReq(userId, { orderId: payload.text, projectId: payload.projectId });
    const res = makeMockRes();
    await processOrder(req, res, () => {});
    return { agent: 'sc_agentic', reason: 'SC agentic processed', data: res._jsonData };
  }

  if (route === 'ml_agent') {
    const { fetchMlEoq } = await import('../agentic/agentic.service');
    const eoq = await fetchMlEoq(payload.text, payload.text);
    return { agent: 'ml_agent', reason: 'ML agent processed', data: eoq };
  }

  return { agent: route, reason: `Routed to ${route}` };
}
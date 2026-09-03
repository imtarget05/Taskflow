import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';

// Must extend before any schema .openapi() usage
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Common security
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});
registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'access_token',
});

// Schemas
const RouteRequest = z.object({
  text: z.string().min(1).max(4000).openapi({ example: 'đơn hàng cần phê duyệt' }),
  projectId: z.string().cuid().optional().nullable().openapi({ example: 'cuid...' }),
  agent: z.enum(['chat', 'sc_agentic', 'ml_agent']).optional().openapi({ example: 'chat' }),
}).openapi('RouteRequest');

const RouteSuccessResponse = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.object({
    routed: z.object({ agent: z.enum(['chat', 'sc_agentic', 'ml_agent']), reason: z.string() }),
    result: z.object({ agent: z.string(), reason: z.string(), data: z.unknown().optional() }),
  }),
}).openapi('RouteSuccessResponse');

const MetricsResponse = z.string().openapi('MetricsPrometheusText');

const RagSearchQuery = z.object({
  q: z.string().min(1).max(500).openapi({ example: 'thanh toán' }),
  projectId: z.string().cuid().optional().openapi({ example: 'cuid...' }),
  topK: z.coerce.number().int().min(1).max(20).optional().openapi({ example: 5 }),
});

registry.registerPath({
  method: 'post',
  path: '/api/agent/route',
  summary: 'Smart Route — phân loại và thực thi agent',
  request: { body: { content: { 'application/json': { schema: RouteRequest } } } },
  responses: {
    200: { description: 'Routed + executed', content: { 'application/json': { schema: RouteSuccessResponse } } },
    400: { description: 'Validation error' },
    401: { description: 'Unauthorized' },
  },
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
});

registry.registerPath({
  method: 'get',
  path: '/api/agent/route',
  summary: 'Preview route without execution',
  request: { query: z.object({ text: z.string().min(1).openapi({ example: 'reorder point 500' }) }) },
  responses: {
    200: { description: 'Route preview', content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.object({ agent: z.string(), reason: z.string() }) }) } } },
  },
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
});

registry.registerPath({
  method: 'get',
  path: '/api/metrics',
  summary: 'Prometheus metrics (auth required)',
  responses: { 200: { description: 'Prometheus text', content: { 'text/plain': { schema: MetricsResponse } } }, 401: { description: 'Unauthorized' } },
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
});

registry.registerPath({
  method: 'get',
  path: '/api/rag/search',
  summary: 'RAG hybrid search',
  request: { query: RagSearchQuery },
  responses: { 200: { description: 'results', content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.object({ query: z.string(), results: z.array(z.object({ id: z.string(), sourceType: z.string(), sourceId: z.string(), title: z.string().nullable(), content: z.string(), score: z.number() })) }) }) } } } },
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
});

registry.registerPath({
  method: 'post',
  path: '/api/rag/index/{projectId}',
  summary: 'Index project tasks into RAG (requires MEMBER)',
  request: { params: z.object({ projectId: z.string().cuid().openapi({ param: { name: 'projectId', in: 'path' } }) }) },
  responses: { 200: { description: 'indexed count', content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.object({ projectId: z.string(), indexed: z.number() }) }) } } }, 403: { description: 'Forbidden (VIEWER)' } },
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
});

const LlmCostQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().openapi({ example: 30 }),
  projectId: z.string().cuid().optional().openapi({ example: 'cuid...' }),
  model: z.string().max(120).optional(),
});

const LlmCostResponse = z.object({
  success: z.boolean(),
  data: z.object({
    currency: z.literal('USD'),
    days: z.number(),
    scope: z.enum(['user', 'project']),
    totalCostUsd: z.number(),
    totalInputTokens: z.number(),
    totalOutputTokens: z.number(),
    totalCalls: z.number(),
    byModel: z.array(z.object({
      model: z.string(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      inputCostUsd: z.number(),
      outputCostUsd: z.number(),
      totalCostUsd: z.number(),
    })),
  }),
});

registry.registerPath({
  method: 'get',
  path: '/api/analytics/llm-cost',
  summary: 'Cost dashboard — LLM spend per user (default) or per project team',
  request: { query: LlmCostQuery },
  responses: {
    200: { description: 'Aggregated LLM cost + tokens', content: { 'application/json': { schema: LlmCostResponse } } },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden (not a member of the project)' },
  },
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
});

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: { title: 'TaskFlow API', version: '1.0.0', description: 'TaskFlow — Kanban + Supply Chain + Agent. Auto-generated from Zod schemas.' },
    servers: [{ url: 'http://localhost:4000', description: 'local' }],
  });
}

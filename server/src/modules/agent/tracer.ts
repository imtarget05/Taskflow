import { Langfuse, type LangfuseTraceClient } from 'langfuse';

/**
 * Lightweight observability for the agent module. Langfuse is wired in ONLY
 * when LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY are set; otherwise every
 * helper is a no-op so the chat flow never depends on tracing being available.
 *
 * Design note (interview-ready): the client LLM is hand-rolled and
 * provider-agnostic (Cloudflare Workers AI / Ollama / vLLM via env). Langfuse
 * is a pure outside layer — it does NOT change call shapes or add framework
 * coupling. We never put raw prompt text or model responses into logs; the
 * trace input/output carry only metadata (model, tokens, decision, latency).
 *
 * Gating reads process.env directly (not the parsed `env` singleton) so it can
 * be toggled per-environment without re-importing the config module.
 */

function hasLangfuseKeys(): boolean {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
}

let client: Langfuse | undefined;

export function isLangfuseEnabled(): boolean {
  return hasLangfuseKeys();
}

export function getTracer(): Langfuse | undefined {
  if (!hasLangfuseKeys()) return undefined;
  if (!client) {
    client = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      baseUrl: process.env.LANGFUSE_BASEURL,
      // Flush promptly so a short-lived server process does not drop traces.
      flushAt: 1,
      release: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'dev',
    });
  }
  return client;
}

/** Context identifying one agent chat turn. */
export interface AgentTurnMeta {
  userId: string;
  conversationId: string;
  userMessage: string;
  projectId?: string | null;
}

/**
 * Wrap one chat turn in a Langfuse trace. The callback receives the trace
 * client (or `undefined` when tracing is off) and may attach spans. The trace
 * is always ended, but never flushed to the network automatically — rely on
 * the SDK's background flush or call `flushTracer()` at shutdown.
 */
export function traceAgentTurn<T>(
  meta: AgentTurnMeta,
  run: (trace: LangfuseTraceClient | undefined) => T
): T {
  const tracer = getTracer();
  if (!tracer) return run(undefined);
  const trace = tracer.trace({
    id: meta.conversationId,
    name: 'agent-turn',
    userId: meta.userId,
    input: { message: meta.userMessage },
    ...(meta.projectId ? { metadata: { projectId: meta.projectId } } : {}),
  });
  try {
    return run(trace);
  } finally {
    // The trace is flushed lazily by the SDK background loop (flushAt=1) or an
    // explicit flushTracer() at shutdown; we never block the chat response.
  }
}

/** Best-effort flush; safe to call on process exit. Swallows all errors. */
export async function flushTracer(): Promise<void> {
  try {
    await client?.flushAsync();
  } catch {
    // Tracing must never break the server.
  }
}

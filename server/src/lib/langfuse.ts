/**
 * Langfuse tracing layer — best-effort, never blocks the server.
 *
 * Langfuse v3 API: `lf.trace({ id, name, ... })` returns a
 * LangfuseTraceClient. Mutate via .update() or pass everything in the
 * initial options. Errors are swallowed so LLM pipelines are never
 * impaired by observability issues.
 */
import { Langfuse } from 'langfuse';

let lf: Langfuse | null = null;

export function initLangfuse(): Langfuse | null {
  if (lf) return lf;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!publicKey || !secretKey) return null;

  try {
    const baseUrl = process.env.LANGFUSE_BASEURL || undefined;
    lf = new Langfuse({ publicKey, secretKey, baseUrl });
    return lf;
  } catch {
    return null;
  }
}

export function getLangfuse(): Langfuse | null {
  if (!lf) initLangfuse();
  return lf;
}

// Minimal, fire-and-forget trace for an LLM call.
// type LingfuseTraceBody = CreateLangfuseTraceBody = {
//   id?: string;
//   name?: string;
//   input?: any;
//   output?: any;
//   ...
// }
// LangfuseTraceClient.update(body: Omit<CreateLangfuseTraceBody, "id">): this;
export function observeLLMCall(
  model: string,
  durationMs: number,
  status: number
): void {
  const lfInstance = getLangfuse();
  if (!lfInstance) return;

  const id = crypto.randomUUID();
  try {
    const trace = lfInstance.trace({
      id,
      name: 'llm.call',
      input: { model },
      output: { durationMs, status },
    });
    trace.update({
      input: { model },
      output: { durationMs, status },
    });
  } catch {
    // Swallow — observability must never break the LLM pipeline.
  }
}

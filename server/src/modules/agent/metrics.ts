const COUNTERS = new Map<string, Map<string, number>>();
const GAUGES = new Map<string, Map<string, number>>();

function getBucket(name: string): Map<string, number> {
  let bucket = COUNTERS.get(name);
  if (!bucket) {
    bucket = new Map();
    COUNTERS.set(name, bucket);
  }
  return bucket;
}

function getGaugeBucket(name: string): Map<string, number> {
  let bucket = GAUGES.get(name);
  if (!bucket) {
    bucket = new Map();
    GAUGES.set(name, bucket);
  }
  return bucket;
}

export function incrementCounter(name: string, labels: Record<string, string>, value = 1): void {
  const bucket = getBucket(name);
  const key = JSON.stringify(labels);
  bucket.set(key, (bucket.get(key) ?? 0) + value);
}

export function setGauge(name: string, labels: Record<string, string>, value: number): void {
  const bucket = getGaugeBucket(name);
  const key = JSON.stringify(labels);
  bucket.set(key, value);
}

export function getCounter(name: string, labels: Record<string, string>): number {
  const bucket = COUNTERS.get(name);
  if (!bucket) return 0;
  return bucket.get(JSON.stringify(labels)) ?? 0;
}

export function getGauge(name: string, labels: Record<string, string>): number {
  const bucket = GAUGES.get(name);
  if (!bucket) return 0;
  return bucket.get(JSON.stringify(labels)) ?? 0;
}

export function getMetrics(): string {
  const lines: string[] = [];

  for (const [name, bucket] of COUNTERS) {
    const typeInfo = name.startsWith('tf_') ? 'counter' : 'counter';
    lines.push(`# TYPE ${name} ${typeInfo}`);
    for (const [key, val] of bucket) {
      const labels = JSON.parse(key);
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`${name}{${labelStr}} ${val}`);
    }
  }

  for (const [name, bucket] of GAUGES) {
    lines.push(`# TYPE ${name} gauge`);
    for (const [key, val] of bucket) {
      const labels = JSON.parse(key);
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`${name}{${labelStr}} ${val}`);
    }
  }

  return lines.join('\n');
}

export function resetMetrics(): void {
  COUNTERS.clear();
  GAUGES.clear();
}

export function recordLLMCall(model: string, durationMs: number, status: number): void {
  incrementCounter('tf_llm_calls_total', { model, status: String(status) });
  incrementCounter('tf_llm_latency_ms_sum', { model }, durationMs);
  incrementCounter('tf_llm_latency_ms_count', { model });
}

export function recordTokens(model: string, promptTokens: number, completionTokens: number): void {
  incrementCounter('tf_llm_tokens_total', { model, type: 'prompt' }, promptTokens);
  incrementCounter('tf_llm_tokens_total', { model, type: 'completion' }, completionTokens);
}

export function recordToolCall(toolName: string): void {
  incrementCounter('tf_tool_calls_total', { tool: toolName });
}

export function recordAgenticDecision(decisionType: string): void {
  incrementCounter('tf_agentic_decisions_total', { decision: decisionType });
}

export function recordError(errorType: string): void {
  incrementCounter('tf_errors_total', { type: errorType });
}

export function getLLMAverageLatency(model: string): number {
  const sum = getCounter('tf_llm_latency_ms_sum', { model });
  const count = getCounter('tf_llm_latency_ms_count', { model });
  if (count === 0) return 0;
  return sum / count;
}

export function getTotalTokens(model: string): number {
  return getCounter('tf_llm_tokens_total', { model, type: 'prompt' }) +
    getCounter('tf_llm_tokens_total', { model, type: 'completion' });
}
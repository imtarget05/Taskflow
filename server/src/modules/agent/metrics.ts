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

const METRIC_HELP: Record<string, string> = {
  tf_llm_calls_total: 'Total LLM calls by model and status',
  tf_llm_latency_ms_sum: 'Sum of LLM latency ms by model',
  tf_llm_latency_ms_count: 'Count of LLM latency measurements by model',
  tf_llm_tokens_total: 'Total LLM tokens by model and type (prompt/completion)',
  tf_llm_cost_usd_total: 'Total LLM cost in USD by model',
  tf_tool_calls_total: 'Total tool calls by tool name',
  tf_agentic_decisions_total: 'Total agentic decisions by type',
  tf_errors_total: 'Total errors by type',
};

function helpFor(name: string): string {
  return METRIC_HELP[name] ?? name;
}

export function getMetrics(): string {
  const lines: string[] = [];

  for (const [name, bucket] of COUNTERS) {
    lines.push(`# HELP ${name} ${helpFor(name)}`);
    lines.push(`# TYPE ${name} counter`);
    for (const [key, val] of bucket) {
      const labels = JSON.parse(key);
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`${name}{${labelStr}} ${val}`);
    }
  }

  for (const [name, bucket] of GAUGES) {
    lines.push(`# HELP ${name} ${helpFor(name)}`);
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

/** Build Prometheus labels for an LLM metric, optionally attributing to a user. */
function metricLabels(model: string, userId?: string): Record<string, string> {
  const labels: Record<string, string> = { model };
  if (userId) labels.user = userId;
  return labels;
}

export function recordLLMCall(
  model: string,
  durationMs: number,
  status: number,
  userId?: string
): void {
  const base = metricLabels(model, userId);
  incrementCounter('tf_llm_calls_total', { ...base, status: String(status) });
  incrementCounter('tf_llm_latency_ms_sum', base, durationMs);
  incrementCounter('tf_llm_latency_ms_count', base);
}

export function recordTokens(
  model: string,
  promptTokens: number,
  completionTokens: number,
  userId?: string
): void {
  const base = metricLabels(model, userId);
  incrementCounter('tf_llm_tokens_total', { ...base, type: 'prompt' }, promptTokens);
  incrementCounter('tf_llm_tokens_total', { ...base, type: 'completion' }, completionTokens);
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

export function recordCost(model: string, costUsd: number, userId?: string): void {
  incrementCounter('tf_llm_cost_usd_total', metricLabels(model, userId), costUsd);
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
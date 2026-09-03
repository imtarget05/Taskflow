import {
  incrementCounter,
  setGauge,
  getCounter,
  getGauge,
  getMetrics,
  resetMetrics,
  recordLLMCall,
  recordTokens,
  recordToolCall,
  recordAgenticDecision,
  recordError,
  getLLMAverageLatency,
  getTotalTokens,
} from '../metrics';

describe('metrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('increments a counter', () => {
    incrementCounter('tf_test', { label: 'a' });
    expect(getCounter('tf_test', { label: 'a' })).toBe(1);
  });

  it('increments a counter by custom value', () => {
    incrementCounter('tf_test', { label: 'a' }, 5);
    expect(getCounter('tf_test', { label: 'a' })).toBe(5);
  });

  it('accumulates counter values', () => {
    incrementCounter('tf_test', { label: 'a' });
    incrementCounter('tf_test', { label: 'a' });
    expect(getCounter('tf_test', { label: 'a' })).toBe(2);
  });

  it('returns 0 for unseen counter', () => {
    expect(getCounter('tf_test', { label: 'a' })).toBe(0);
  });

  it('sets and gets a gauge', () => {
    setGauge('tf_gauge', { label: 'a' }, 42);
    expect(getGauge('tf_gauge', { label: 'a' })).toBe(42);
  });

  it('returns 0 for unseen gauge', () => {
    expect(getGauge('tf_gauge', { label: 'a' })).toBe(0);
  });

  it('returns Prometheus text format', () => {
    incrementCounter('tf_test', { label: 'a' });
    const output = getMetrics();
    expect(output).toContain('# TYPE tf_test counter');
    expect(output).toContain('tf_test{label="a"} 1');
  });

  it('includes gauge in metrics output', () => {
    setGauge('tf_gauge', { label: 'b' }, 10);
    const output = getMetrics();
    expect(output).toContain('# TYPE tf_gauge gauge');
    expect(output).toContain('tf_gauge{label="b"} 10');
  });

  it('returns empty metrics when no data', () => {
    expect(getMetrics()).toBe('');
  });
});

describe('metrics record helpers', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('records LLM call', () => {
    recordLLMCall('qwen', 150, 200);
    expect(getCounter('tf_llm_calls_total', { model: 'qwen', status: '200' })).toBe(1);
  });

  it('records tokens', () => {
    recordTokens('qwen', 100, 50);
    expect(getCounter('tf_llm_tokens_total', { model: 'qwen', type: 'prompt' })).toBe(100);
    expect(getCounter('tf_llm_tokens_total', { model: 'qwen', type: 'completion' })).toBe(50);
  });

  it('records tool call', () => {
    recordToolCall('create_task');
    expect(getCounter('tf_tool_calls_total', { tool: 'create_task' })).toBe(1);
  });

  it('records agentic decision', () => {
    recordAgenticDecision('auto');
    expect(getCounter('tf_agentic_decisions_total', { decision: 'auto' })).toBe(1);
  });

  it('records error', () => {
    recordError('ETIMEOUT');
    expect(getCounter('tf_errors_total', { type: 'ETIMEOUT' })).toBe(1);
  });

  it('computes average LLM latency', () => {
    recordLLMCall('qwen', 100, 200);
    recordLLMCall('qwen', 200, 200);
    expect(getLLMAverageLatency('qwen')).toBe(150);
  });

  it('returns 0 average latency when no calls', () => {
    expect(getLLMAverageLatency('qwen')).toBe(0);
  });

  it('computes total tokens', () => {
    recordTokens('qwen', 100, 50);
    expect(getTotalTokens('qwen')).toBe(150);
  });
});
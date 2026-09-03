import {
  computeLLMCost,
  getLLMPricing,
  LLMCostBreakdown,
} from '../llm';

describe('LLM pricing', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns default pricing for a known model', () => {
    const p = getLLMPricing('gpt-4o');
    expect(p).toBeDefined();
    expect(p!.inputUsdPer1M).toBe(1.5);
    expect(p!.outputUsdPer1M).toBe(3.0);
  });

  it('returns undefined for unknown/local models (cost stays 0)', () => {
    expect(getLLMPricing('llama3:latest')).toBeUndefined();
  });

  it('env JSON override adds pricing for a previously-unknown model', () => {
    process.env.LLM_PRICING_JSON = JSON.stringify({
      'llama3:latest': { inputUsdPer1M: 0.2, outputUsdPer1M: 0.5 },
    });
    const p = getLLMPricing('llama3:latest');
    expect(p).toEqual({ inputUsdPer1M: 0.2, outputUsdPer1M: 0.5 });
  });

  it('env JSON override replaces a default model pricing', () => {
    process.env.LLM_PRICING_JSON = JSON.stringify({
      'gpt-4o': { inputUsdPer1M: 5, outputUsdPer1M: 15 },
    });
    const p = getLLMPricing('gpt-4o');
    expect(p).toEqual({ inputUsdPer1M: 5, outputUsdPer1M: 15 });
  });
});

describe('computeLLMCost', () => {
  it('computes cost from per-1M-token pricing', () => {
    const cost: LLMCostBreakdown = computeLLMCost('gpt-4o', 1_000_000, 500_000);
    expect(cost.promptTokens).toBe(1_000_000);
    expect(cost.completionTokens).toBe(500_000);
    expect(cost.inputCostUsd).toBe(1.5);
    // 500k completion tokens * 3.0 / 1M
    expect(cost.outputCostUsd).toBe(1.5);
    expect(cost.totalCostUsd).toBe(3.0);
  });

  it('returns zero cost when model has no pricing', () => {
    const cost = computeLLMCost('llama3:latest', 1000, 500);
    expect(cost.totalCostUsd).toBe(0);
    expect(cost.inputCostUsd).toBe(0);
    expect(cost.outputCostUsd).toBe(0);
    // tokens are still reported for observability
    expect(cost.promptTokens).toBe(1000);
    expect(cost.completionTokens).toBe(500);
  });

  it('rounds to micro-USD precision', () => {
    const cost = computeLLMCost('gpt-3.5-turbo', 123, 456);
    expect(cost.inputCostUsd).toBeCloseTo(123 / 1_000_000 * 0.5, 6);
    expect(cost.outputCostUsd).toBeCloseTo(456 / 1_000_000 * 1.5, 6);
    expect(cost.totalCostUsd).toBeLessThan(0.01);
  });

  it('handles zero tokens', () => {
    const cost = computeLLMCost('gpt-4o', 0, 0);
    expect(cost.totalCostUsd).toBe(0);
  });

    it('clamps negative token inputs to zero', () => {
    const cost = computeLLMCost('llama3:latest', -10, 5);
    expect(cost.promptTokens).toBe(0);
    expect(cost.completionTokens).toBe(5);
    expect(cost.totalCostUsd).toBe(0);
  });
});

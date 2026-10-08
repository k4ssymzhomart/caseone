// USD per million tokens (CLAUDE.md §2, PHASE_0 0.8). The budget guard and llm_audit.cost_usd use these numbers.

export interface ModelPrice {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens (thinking included). */
  output: number;
  /** True when the price list only says "from": treat the cost as an estimate. */
  estimate?: boolean;
}

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export const PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, estimate: true },
  // Other ids a LLM_MODEL_SMART / LLM_MODEL_FAST override may name.
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  mock: { input: 0, output: 0 },
};

/** Unknown models are priced high on purpose, so the budget guard errs on the safe side. */
export const FALLBACK_PRICE: ModelPrice = { input: 5, output: 25, estimate: true };

/** Price for a model id; tolerates a date suffix or a platform prefix (`anthropic.claude-…`). */
export function priceFor(model: string): ModelPrice {
  const exact = PRICES[model];
  if (exact) return exact;
  const bare = model.replace(/^.*?(claude-)/, '$1');
  const known = Object.keys(PRICES)
    .filter((id) => bare === id || bare.startsWith(`${id}-`) || bare.startsWith(`${id}@`))
    .sort((a, b) => b.length - a.length)[0];
  return known ? (PRICES[known] ?? FALLBACK_PRICE) : FALLBACK_PRICE;
}

/** Cost in USD, rounded to 1e-6. Cache writes cost 1.25× input, cache reads 0.1× input. */
export function estimateCost(model: string, usage: LlmUsage): number {
  const p = priceFor(model);
  const write = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const usd =
    (usage.input_tokens * p.input +
      write * p.input * 1.25 +
      read * p.input * 0.1 +
      usage.output_tokens * p.output) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

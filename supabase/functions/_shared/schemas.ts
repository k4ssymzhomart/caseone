// JSON schemas for structured outputs (`output_config.format`), one per LLM purpose.
// Rules of the API: every object has additionalProperties false and lists all its keys in required;
// no minimum, maximum, minLength, maxLength, minItems, pattern or similar (they return a 400).
// Ranges such as confidence 0..1 or score 1..5 are stated in the prompt and in `description`.

export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean' | 'null';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: false;
  items?: JsonSchema;
  enum?: readonly (string | number | boolean | null)[];
  anyOf?: JsonSchema[];
}

const str = (description?: string): JsonSchema =>
  description ? { type: 'string', description } : { type: 'string' };
const int = (description?: string): JsonSchema =>
  description ? { type: 'integer', description } : { type: 'integer' };
const num = (description?: string): JsonSchema =>
  description ? { type: 'number', description } : { type: 'number' };
const bool = (description?: string): JsonSchema =>
  description ? { type: 'boolean', description } : { type: 'boolean' };
const choice = (values: readonly string[], description?: string): JsonSchema =>
  description ? { type: 'string', enum: values, description } : { type: 'string', enum: values };
const arr = (items: JsonSchema, description?: string): JsonSchema =>
  description ? { type: 'array', items, description } : { type: 'array', items };
const nullable = (schema: JsonSchema, description?: string): JsonSchema =>
  description
    ? { anyOf: [schema, { type: 'null' }], description }
    : { anyOf: [schema, { type: 'null' }] };
/** An object whose `required` always lists every key. */
const obj = (properties: Record<string, JsonSchema>, description?: string): JsonSchema => ({
  type: 'object',
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

// ---------------------------------------------------------------------------
// verify (CLAUDE.md §11, step 3)
// ---------------------------------------------------------------------------

export interface VerifyAnswer {
  work_match: { verdict: 'full' | 'partial' | 'none'; explanation: string };
  code_consistent: boolean;
  suggested_code: string;
  materials_logic: { verdict: 'ok' | 'suspicious'; explanation: string };
  photo: {
    after_present: boolean;
    same_equipment: 'yes' | 'no' | 'unsure';
    problem_resolved: 'yes' | 'no' | 'unsure' | 'not_applicable';
    quality_issues: string[];
    score_1_5: number;
    explanation: string;
  };
  confidence: number;
  feedback_worker: { good: string[]; improve: string[] };
  summary_master: string;
}

export const verifySchema: JsonSchema = obj({
  work_match: obj({
    verdict: choice(
      ['full', 'partial', 'none'],
      'соответствие выполненных работ описанной проблеме',
    ),
    explanation: str(),
  }),
  code_consistent: bool('шифр неисправности соответствует работам'),
  suggested_code: str('подходящий шифр из справочника; если шифр верен, текущий шифр'),
  materials_logic: obj({ verdict: choice(['ok', 'suspicious']), explanation: str() }),
  photo: obj({
    after_present: bool(),
    same_equipment: choice(['yes', 'no', 'unsure']),
    problem_resolved: choice(['yes', 'no', 'unsure', 'not_applicable']),
    quality_issues: arr(str()),
    score_1_5: int('целое от 1 до 5'),
    explanation: str(),
  }),
  confidence: num('от 0 до 1'),
  feedback_worker: obj({ good: arr(str()), improve: arr(str()) }),
  summary_master: str(),
});

// ---------------------------------------------------------------------------
// insights (CLAUDE.md §15 cards)
// ---------------------------------------------------------------------------

/** Detector kinds (public.insight_cards and the d_* detectors), also the focus values of parse_query. */
export const INSIGHT_KINDS = [
  'top_equipment',
  'top_areas',
  'repeat_faults',
  'post_ppr',
  'time_patterns',
  'worker_repeats',
  'materials',
  'trend',
  'other',
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export const SEVERITY_VALUES = ['info', 'warning', 'critical'] as const;
export type InsightSeverity = (typeof SEVERITY_VALUES)[number];

/**
 * One card as the model writes it. Numbers live in the text only; `refs` names the detector rows the card is built
 * on («top_equipment.0», the `ref` of each row in the input), and ai-insights fills `evidence` (order ids and the
 * row's numbers) from those rows, so evidence is never written by the model.
 */
export interface InsightCardAnswer {
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  body: string;
  recommendation: string;
  refs: string[];
}

export interface InsightsAnswer {
  cards: InsightCardAnswer[];
}

export const insightsSchema: JsonSchema = obj({
  cards: arr(
    obj({
      kind: choice(INSIGHT_KINDS),
      severity: choice(SEVERITY_VALUES),
      title: str(),
      body: str(),
      recommendation: str(),
      refs: arr(str(), 'ref строк детекторов из входных данных, на которых построена карточка'),
    }),
  ),
});

// ---------------------------------------------------------------------------
// shift summary, rating explanation, query parsing, smoke
// ---------------------------------------------------------------------------

export interface ShiftSummaryAnswer {
  summary: string;
  recommendations: string[];
}

export const shiftSummarySchema: JsonSchema = obj({
  summary: str('от 5 до 8 предложений'),
  recommendations: arr(str(), 'ровно 3 рекомендации'),
});

export interface ExplainRatingAnswer {
  text: string;
}

export const explainRatingSchema: JsonSchema = obj({
  text: str('ровно три предложения'),
});

export interface ParseQueryAnswer {
  area_id: number | null;
  from: string | null;
  to: string | null;
  focus: InsightKind[];
}

export const parseQuerySchema: JsonSchema = obj({
  area_id: nullable(int(), 'id участка из списка или null'),
  from: nullable(str(), 'ISO 8601 со смещением +05:00 или null'),
  to: nullable(str(), 'ISO 8601 со смещением +05:00 или null'),
  focus: arr(choice(INSIGHT_KINDS)),
});

export interface SmokeAnswer {
  ok: boolean;
  echo: string;
}

export const smokeSchema: JsonSchema = obj({ ok: bool(), echo: str() });

// ---------------------------------------------------------------------------
// purposes
// ---------------------------------------------------------------------------

export const LLM_PURPOSES = [
  'verify',
  'insights',
  'shift_summary',
  'explain_rating',
  'parse_query',
  'smoke',
] as const;
export type LlmPurpose = (typeof LLM_PURPOSES)[number];

export interface PurposeOutput {
  verify: VerifyAnswer;
  insights: InsightsAnswer;
  shift_summary: ShiftSummaryAnswer;
  explain_rating: ExplainRatingAnswer;
  parse_query: ParseQueryAnswer;
  smoke: SmokeAnswer;
}

export const SCHEMAS: Readonly<Record<LlmPurpose, JsonSchema>> = {
  verify: verifySchema,
  insights: insightsSchema,
  shift_summary: shiftSummarySchema,
  explain_rating: explainRatingSchema,
  parse_query: parseQuerySchema,
  smoke: smokeSchema,
};

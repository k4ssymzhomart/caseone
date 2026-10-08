// The deterministic half of the AI completion check (CLAUDE.md §11), mirrored from
// supabase/migrations/20261008100011_rota_ai_review.sql for MockApi and the UI:
//   rulesChecks()     = internal.rules_checks (R1 to R4: same ids, titles, points, statuses and message_ru)
//   aggregateReview() = the scoring half of public.ai_submit (L1, L2, the verdict, needs_master_review,
//                       feedback and the master summary), with or without an LLM answer
// The SQL is authoritative; a change there must be repeated here (the tests pin the golden cases).

import type { CheckStatus, Verdict } from './enums';
import { VERDICT_LABEL } from './status';
import type {
  AiCheck,
  AiFeedback,
  AiMaterialsLogic,
  AiPhotoJudgement,
  AiReview,
  AiWorkMatch,
  Directories,
  MaterialLine,
  Order,
  OrderPhoto,
  Timestamp,
} from './types';
import { ddmm } from '../format/time';
import { plural, SCORE_FORMS } from '../format/number';

// ---------------------------------------------------------------------------
// numeric helpers with Postgres semantics
// ---------------------------------------------------------------------------

/** Postgres round() on numeric: half away from zero, `digits` fraction digits. */
export function pgRound(value: number, digits = 0): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  // shift through the decimal string (15 significant digits wash out float noise), so 1.005 and
  // 29.749999999999996 round like the exact numeric values 1.005 and 29.75 do
  const text = String(Number(abs.toPrecision(15)));
  if (text.includes('e')) return (sign * Math.round(abs * 10 ** digits)) / 10 ** digits;
  const shifted = Math.round(Number(`${text}e${digits}`));
  return sign * Number(`${shifted}e-${digits}`);
}

/** internal.ru_num: the full value with a decimal comma and no trailing zeros: 6 → «6», 0.50 → «0,5». */
export function ruNumeric(value: number): string {
  // 10 fraction digits wash out float noise (0.1 + 0.2) that numeric never has
  const clean = Number(value.toFixed(10));
  return String(clean).replace('.', ',');
}

/** internal.ru_duration: «45 мин», «2 ч», «1 ч 30 мин»; at least «1 мин»; «?» for null. */
export function ruDuration(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return '?';
  const total = pgRound(minutes);
  if (total >= 60) {
    const rest = total % 60;
    return `${Math.floor(total / 60)} ч${rest > 0 ? ` ${rest} мин` : ''}`;
  }
  return `${Math.max(total, 1)} мин`;
}

const HEX16 = /^[0-9a-fA-F]{16}$/;

/** internal.hamming: bit distance of two 16 hex char dHashes; null unless both are well formed. */
export function dhashDistance(a: string | null | undefined, b: string | null | undefined): number | null {
  if (a == null || b == null || !HEX16.test(a) || !HEX16.test(b)) return null;
  let bits = 0;
  for (let i = 0; i < 16; i += 1) {
    let x = parseInt(a.charAt(i), 16) ^ parseInt(b.charAt(i), 16);
    while (x > 0) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

/** percentile_cont(p) within group (order by value): linear interpolation; null for no values. */
export function percentileCont(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (pos - lo);
}

/** Order fields materialP90Lookup reads. */
export type P90Order = Pick<Order, 'id' | 'fault_code' | 'status'>;
/** order_materials fields materialP90Lookup reads. */
export interface P90MaterialRow {
  order_id: number;
  material_id: number;
  qty: number;
}

/**
 * internal.material_p90 for one fault code: p90 of the line quantities of a material on closed orders with this
 * code; null below 5 samples. Returns a lookup by material id for rulesChecks({ p90 }).
 */
export function materialP90Lookup(
  faultCode: string | null,
  orders: readonly P90Order[],
  orderMaterials: readonly P90MaterialRow[],
): (materialId: number) => number | null {
  if (faultCode == null) return () => null;
  const closed = new Set(orders.filter((o) => o.status === 'closed' && o.fault_code === faultCode).map((o) => o.id));
  const samples = new Map<number, number[]>();
  for (const m of orderMaterials) {
    if (!closed.has(m.order_id)) continue;
    const list = samples.get(m.material_id) ?? [];
    list.push(m.qty);
    samples.set(m.material_id, list);
  }
  return (materialId) => {
    const list = samples.get(materialId);
    return list && list.length >= 5 ? percentileCont(list, 0.9) : null;
  };
}

// ---------------------------------------------------------------------------
// R1 to R4
// ---------------------------------------------------------------------------

export const RULE_IDS = ['R1', 'R2', 'R3', 'R4'] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const RULE_TITLE: Readonly<Record<RuleId, string>> = {
  R1: 'Полнота отчёта',
  R2: 'Подлинность фото',
  R3: 'Материалы',
  R4: 'Время и срок',
};

export const RULE_MAX: Readonly<Record<RuleId, number>> = { R1: 20, R2: 10, R3: 15, R4: 20 };
/** Σ of the rule maxima: a rules only score is scaled by 100 / 65. */
export const RULES_MAX_TOTAL = 65;

/** The order fields rules_checks reads. */
export type RulesOrder = Pick<
  Order,
  | 'id'
  | 'client_ref'
  | 'type'
  | 'works_done'
  | 'fault_code'
  | 'norm_hours'
  | 'started_at'
  | 'done_at'
  | 'due_at'
  | 'paused_total_sec'
  | 'is_demo'
>;

/** The photo fields rules_checks reads. */
export type RulesPhoto = Pick<
  OrderPhoto,
  'id' | 'order_id' | 'client_ref' | 'kind' | 'source' | 'captured_at' | 'uploaded_at' | 'dhash' | 'sha256'
>;

export interface RulesInput {
  order: RulesOrder;
  /**
   * Photos to look at: this order's (order_id = order.id or client_ref = order.client_ref) and, for the duplicate
   * check, other orders' photos. Pass every photo you have; the function filters like the SQL.
   */
  photos: readonly RulesPhoto[];
  /** Number (№) of another order, for «фото совпадает с фото наряда №…»; photos of unknown orders are skipped. */
  orderNumber?: (orderId: number) => number | null | undefined;
  /** order_materials of this order (complete stores only lines with qty > 0). */
  materials: readonly MaterialLine[];
  /** no_materials from the payload of the last complete event («без материалов»). */
  no_materials?: boolean;
  directories: Pick<Directories, 'materials' | 'work_norms'>;
  /** internal.material_p90 for (order.fault_code, material); see materialP90Lookup. Omitted: no history. */
  p90?: (materialId: number) => number | null;
  /** settings.duplicate_hamming_max (default 6). */
  duplicate_hamming_max?: number;
  /** The server clock (default new Date()): bounds the photo window when done_at is empty. */
  now?: Date;
}

const MIN = 60_000;
const ms = (ts: Timestamp): number => Date.parse(ts);
const charLength = (s: string): number => Array.from(s).length;
const pgTrim = (s: string): string => s.replace(/^ +| +$/g, '');

function check(id: RuleId, status: CheckStatus, points: number, messages: readonly string[]): AiCheck {
  return { id, title: RULE_TITLE[id], status, points, max: RULE_MAX[id], message_ru: messages.join('; ') };
}

/** The time half of R4: work minutes (pauses and rework gaps excluded) against the norm (demo accelerated). */
export interface TimeVsNorm {
  work_min: number;
  norm_min: number;
  /** null when the norm is 0. */
  ratio: number | null;
}

/**
 * R4's arithmetic: work = done_at − started_at − paused_total_sec (resume_rework adds the gap between the
 * submission and the restart to paused_total_sec, so it counts as a pause); norm = order.norm_hours, else the
 * fault code's norm, else 1 h. A demo order shorter than 15 minutes is compared with the accelerated norm
 * (1 norm hour = 2 minutes). null without started_at or done_at.
 */
export function timeVsNorm(
  order: Pick<Order, 'started_at' | 'done_at' | 'paused_total_sec' | 'norm_hours' | 'fault_code' | 'is_demo'>,
  workNorms: Directories['work_norms'],
): TimeVsNorm | null {
  if (order.started_at == null || order.done_at == null) return null;
  const workMin = (ms(order.done_at) - ms(order.started_at)) / MIN - order.paused_total_sec / 60;
  const code = order.fault_code === '' ? null : order.fault_code;
  const hours = order.norm_hours ?? workNorms.find((n) => n.fault_code === code)?.norm_hours ?? 1;
  let normMin = hours * 60;
  if (order.is_demo && workMin < 15) normMin /= 30;
  return { work_min: workMin, norm_min: normMin, ratio: normMin === 0 ? null : workMin / normMin };
}

/** internal.rules_checks: [R1, R2, R3, R4]. */
export function rulesChecks(input: RulesInput): AiCheck[] {
  const { order: o, directories } = input;
  const now = input.now ?? new Date();
  const dupMax = input.duplicate_hamming_max ?? 6;
  const faultCode = o.fault_code === '' ? null : o.fault_code;
  const own = (p: RulesPhoto): boolean => p.order_id === o.id || p.client_ref === o.client_ref;
  const after = input.photos.filter((p) => own(p) && p.kind === 'after').sort((a, b) => a.id - b.id);
  const before = input.photos.filter((p) => own(p) && p.kind === 'before');
  const lines = input.materials.filter((m) => m.qty > 0);

  // R1 completeness (20)
  let r1 = 20;
  let r1s: CheckStatus = 'pass';
  let r1m: string[] = [];
  if (after.length === 0 && o.type === 'unplanned') {
    r1 = 0;
    r1s = 'fail';
    r1m.push('нет фото после: обязательно для внеплановых работ');
  } else if (after.length === 0) {
    r1 -= 5;
    r1m.push('нет фото после');
  }
  if (charLength(pgTrim(o.works_done ?? '')) < 15) {
    r1 = Math.max(r1 - 5, 0);
    r1m.push('описание работ короткое');
  }
  if (faultCode == null) {
    r1 = Math.max(r1 - 5, 0);
    r1m.push('не указан шифр неисправности');
  }
  if (!input.no_materials && lines.length === 0) {
    r1 = Math.max(r1 - 5, 0);
    r1m.push('не указаны материалы');
  }
  if (r1s !== 'fail' && r1 < 20) r1s = 'warn';
  if (r1s === 'pass') r1m = ['отчёт заполнен, шифр и материалы указаны'];

  // R2 photo integrity (10)
  let r2 = 10;
  let r2s: CheckStatus = 'pass';
  let r2m: string[] = [];
  if (after.length === 0) {
    r2 = 5;
    r2s = 'warn';
    r2m = ['фото после нет, подлинность не проверялась'];
  } else {
    const others = input.photos
      .filter((q) => q.order_id != null && q.order_id !== o.id && q.dhash != null)
      .map((q) => ({ q, number: q.order_id == null ? null : (input.orderNumber?.(q.order_id) ?? null) }))
      .filter((x): x is { q: RulesPhoto; number: number } => x.number != null)
      .sort((a, b) => ms(b.q.uploaded_at) - ms(a.q.uploaded_at));
    for (const p of after) {
      if (p.source === 'gallery') {
        r2 = Math.min(r2, 7);
        r2m.push('фото после загружено из галереи');
      }
      if (
        p.captured_at != null &&
        o.started_at != null &&
        (ms(p.captured_at) < ms(o.started_at) - 5 * MIN ||
          ms(p.captured_at) > (o.done_at != null ? ms(o.done_at) : now.getTime()) + 2 * MIN)
      ) {
        r2 = 0;
        r2s = 'fail';
        r2m.push('фото сделано не во время работ');
      }
      if (p.dhash != null) {
        const dup = others.find((x) => {
          const d = dhashDistance(x.q.dhash, p.dhash);
          return d != null && d <= dupMax;
        });
        if (dup) {
          r2 = 0;
          r2s = 'fail';
          r2m.push(`фото совпадает с фото наряда №${dup.number} от ${ddmm(dup.q.captured_at ?? dup.q.uploaded_at)}`);
        }
      }
      const sameAsBefore = before.some((b) => {
        if (b.sha256 != null && p.sha256 != null && b.sha256 === p.sha256) return true;
        const d = dhashDistance(b.dhash, p.dhash);
        return (
          d != null &&
          d <= 3 &&
          b.captured_at != null &&
          p.captured_at != null &&
          Math.abs(ms(b.captured_at) - ms(p.captured_at)) <= 120_000
        );
      });
      if (sameAsBefore) {
        r2 = 0;
        r2s = 'fail';
        r2m.push('фото после совпадает с фото до');
      }
    }
    if (r2s !== 'fail' && r2 < 10) r2s = 'warn';
    if (r2s === 'pass') r2m = ['фото сделано камерой во время работ'];
  }

  // R3 materials (15): typical list for the code, qty_max, history p90
  let r3 = 15;
  let r3s: CheckStatus = 'pass';
  let r3m: string[] = [];
  const typical = faultCode == null ? null : (directories.work_norms.find((n) => n.fault_code === faultCode)?.typical ?? null);
  const summed = new Map<number, number>();
  for (const line of lines) summed.set(line.material_id, (summed.get(line.material_id) ?? 0) + line.qty);
  const grouped = [...summed.entries()].sort((a, b) => a[0] - b[0]);
  for (const [materialId, qty] of grouped) {
    const material = directories.materials.find((m) => m.id === materialId);
    if (!material) continue; // the SQL joins materials
    const name = material.name.toLowerCase();
    const max = typical?.find((t) => t.material_id === materialId)?.qty_max ?? null;
    const p90 = input.p90?.(materialId) ?? null;
    if (typical != null && max == null) {
      r3 -= 3;
      r3m.push(`материал не типовой для шифра ${faultCode ?? ''}: ${name}`);
    }
    if ((max != null && qty > max) || (p90 != null && qty > 2 * p90)) {
      r3s = 'fail';
      r3m.push(
        `перерасход: ${name} ${ruNumeric(qty)} ${material.unit} при норме до ${ruNumeric(max ?? pgRound(p90 ?? 0, 1))}`,
      );
    } else if (p90 != null && qty > p90) {
      r3 -= 3;
      r3m.push(`расход выше обычного: ${name} ${ruNumeric(qty)} ${material.unit}`);
    }
  }
  if (r3s === 'fail') r3 = 0;
  else if (r3 < 15) r3s = 'warn';
  r3 = Math.max(r3, 0);
  if (r3s === 'pass') r3m = ['материалы в пределах нормы'];

  // R4 time (20): work minus pauses against the norm, then the deadline
  let r4 = 20;
  let r4s: CheckStatus = 'pass';
  let r4m: string[] = [];
  const time = timeVsNorm({ ...o, fault_code: faultCode }, directories.work_norms);
  if (time != null && o.done_at != null) {
    const { work_min: work, norm_min: norm, ratio } = time;
    if (ratio != null && ratio < 0.25) {
      r4 = 10;
      r4m.push(`подозрительно быстро: ${ruDuration(work)} при нормативе ${ruDuration(norm)}`);
    } else if (ratio != null && ratio > 1.5) {
      r4 = 10;
      r4m.push(`время ${ruDuration(work)} при нормативе ${ruDuration(norm)}`);
    } else if (ratio != null && ratio > 1.2) {
      r4 = 15;
      r4m.push(`время ${ruDuration(work)} при нормативе ${ruDuration(norm)}`);
    }
    if (ms(o.done_at) > ms(o.due_at)) {
      r4 -= 5;
      r4m.push(`срок нарушен на ${Math.ceil((ms(o.done_at) - ms(o.due_at)) / MIN)} мин`);
    }
    if (r4 < 20) r4s = 'warn';
    if (r4s === 'pass') r4m = [`время ${ruDuration(work)} при нормативе ${ruDuration(norm)}`];
  } else {
    r4 = 10;
    r4s = 'warn';
    r4m = ['нет отметок начала или окончания работ'];
  }

  return [check('R1', r1s, r1, r1m), check('R2', r2s, r2, r2m), check('R3', r3s, r3, r3m), check('R4', r4s, r4, r4m)];
}

// ---------------------------------------------------------------------------
// aggregation (public.ai_submit)
// ---------------------------------------------------------------------------

/** The LLM answer as ai_submit reads it: every field may be missing, as in jsonb. AiLlmAnswer fits. */
export interface LlmAnswerInput {
  work_match?: Partial<AiWorkMatch> | null;
  code_consistent?: boolean | null;
  suggested_code?: string | null;
  materials_logic?: Partial<AiMaterialsLogic> | null;
  photo?: Partial<AiPhotoJudgement> | null;
  confidence?: number | null;
  feedback_worker?: AiFeedback | null;
  summary_master?: string | null;
}

/** p_meta of ai_submit. */
export interface ReviewMeta {
  model?: string | null;
  latency_ms?: number | null;
  /** Why there is no LLM answer; L1 then reads «не выполнено: {error}» (default «ИИ недоступен»). */
  error?: string | null;
}

/** What public.ai_check_rules passes: the rules only review a signed-in assignee or master may start. */
export const RULES_ONLY_META: Readonly<ReviewMeta> = { model: 'rules', error: 'проверка только по правилам' };

/** The scored part of an ai_reviews row. */
export type ReviewOutcome = Pick<
  AiReview,
  | 'verdict'
  | 'score'
  | 'score5'
  | 'confidence'
  | 'needs_master_review'
  | 'checks'
  | 'photo'
  | 'feedback_worker'
  | 'report_master'
  | 'model'
  | 'latency_ms'
>;

export interface AggregateOptions {
  /** settings.ai_confidence_threshold (default 0.6). */
  threshold?: number;
  meta?: ReviewMeta;
}

/** Score to verdict when no rule and no LLM check failed: ≥ 80 accepted, 60..79 with remarks, else rework. */
export function verdictForScore(score: number): Verdict {
  if (score >= 80) return 'accepted';
  if (score >= 60) return 'accepted_with_remarks';
  return 'rework';
}

/** score5 = clamp(round(score / 20), 1, 5). */
export function score5Of(score: number): number {
  return Math.max(1, Math.min(5, pgRound(score / 20)));
}

/** concat_ws('; ', …) with nullif(x, ''): empty and missing parts are skipped. */
function joinParts(...parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => p != null && p !== '').join('; ');
}

/**
 * The scoring of public.ai_submit. With an LLM answer: L1 work match (20), L2 photo (15), the materials
 * judgement as −5 inside R3. Without one: L1 and L2 «не выполнено» and the rules scaled to 100 (Σ R × 100 / 65).
 * Any rule fail → rework whatever the LLM says; then an LLM fail; then the score.
 * needs_master_review = no rule failed AND (no LLM answer OR confidence < threshold).
 */
export function aggregateReview(
  rules: readonly AiCheck[],
  llm: LlmAnswerInput | null,
  options: AggregateOptions = {},
): ReviewOutcome {
  const threshold = options.threshold ?? 0.6;
  const meta = options.meta ?? {};
  const ruleFail = rules.some((c) => c.status === 'fail');
  let llmFail = false;
  let checks: AiCheck[];
  let score: number;
  let confidence: number | null = null;

  if (llm != null) {
    // L1 work match (20)
    const wm = llm.work_match?.verdict;
    let l1 = wm === 'full' ? 20 : wm === 'partial' ? 10 : 0;
    let l1s: CheckStatus = l1 === 0 ? 'fail' : l1 < 20 ? 'warn' : 'pass';
    let l1m = llm.work_match?.explanation ?? '';
    if (l1 === 0) llmFail = true;
    if (llm.code_consistent === false) {
      l1 = Math.max(l1 - 8, 0);
      if (l1s === 'pass') l1s = 'warn';
      l1m = joinParts(l1m, `шифр не соответствует работам, предложен ${llm.suggested_code ?? 'другой'}`);
    }
    // materials logic: −5 inside R3
    let rulesOut = rules.map((c) => ({ ...c }));
    if (llm.materials_logic?.verdict === 'suspicious') {
      const explanation = llm.materials_logic.explanation ?? 'набор материалов вызывает вопросы';
      rulesOut = rulesOut.map((c) =>
        c.id === 'R3'
          ? {
              ...c,
              points: Math.max(c.points - 5, 0),
              status: c.status === 'fail' ? 'fail' : 'warn',
              message_ru: joinParts(
                c.message_ru === 'материалы в пределах нормы' ? null : c.message_ru,
                `ИИ: ${explanation}`,
              ),
            }
          : c,
      );
    }
    // L2 photo (15)
    const photo = llm.photo ?? null;
    let l2 = Math.min(Math.max(Math.round(photo?.score_1_5 ?? 0), 0), 5) * 3;
    let l2s: CheckStatus = l2 >= 12 ? 'pass' : 'warn';
    let l2m = photo?.explanation ?? '';
    if (photo?.after_present === false) {
      l2 = 0;
      l2s = 'warn';
      l2m = joinParts('фото после нет', l2m);
    }
    if (photo?.problem_resolved === 'no') {
      l2s = 'fail';
      llmFail = true;
      l2m = joinParts('неисправность на фото после не устранена', l2m);
    }
    if (photo?.same_equipment === 'no') {
      l2s = 'fail';
      llmFail = true;
      l2m = joinParts('на фото после другое оборудование', l2m);
    }
    confidence = llm.confidence ?? null;
    checks = [
      ...rulesOut,
      { id: 'L1', title: 'Работы и шифр', status: l1s, points: l1, max: 20, message_ru: l1m },
      { id: 'L2', title: 'Фото после', status: l2s, points: l2, max: 15, message_ru: l2m },
    ];
    score = checks.reduce((sum, c) => sum + c.points, 0);
  } else {
    checks = [
      ...rules.map((c) => ({ ...c })),
      {
        id: 'L1',
        title: 'Работы и шифр',
        status: 'skipped',
        points: 0,
        max: 20,
        message_ru: `не выполнено: ${meta.error ?? 'ИИ недоступен'}`,
      },
      { id: 'L2', title: 'Фото после', status: 'skipped', points: 0, max: 15, message_ru: 'не выполнено' },
    ];
    score = pgRound((rules.reduce((sum, c) => sum + c.points, 0) * 100) / RULES_MAX_TOTAL);
  }
  score = Math.min(Math.max(score, 0), 100);

  const verdict: Verdict = ruleFail || llmFail ? 'rework' : verdictForScore(score);
  const needsMasterReview = !ruleFail && (llm == null || (confidence ?? 0) < threshold);

  const feedback: AiFeedback = llm?.feedback_worker ?? {
    good: checks.filter((c) => c.status === 'pass').map((c) => c.message_ru),
    improve: checks.filter((c) => c.status === 'warn' || c.status === 'fail').map((c) => c.message_ru),
  };
  const fails = checks.filter((c) => c.status === 'fail').map((c) => c.message_ru);
  const summary =
    llm?.summary_master != null && llm.summary_master !== ''
      ? llm.summary_master
      : `${VERDICT_LABEL[verdict]}, ${score} ${plural(score, SCORE_FORMS)}. ` +
        (fails.length > 0 ? fails.join('; ') : 'Нарушений правил нет') +
        (needsMasterReview ? '. Нужна проверка мастером.' : '.');

  return {
    verdict,
    score,
    score5: score5Of(score),
    confidence,
    needs_master_review: needsMasterReview,
    checks,
    photo: (llm?.photo ?? null) as AiPhotoJudgement | null,
    feedback_worker: feedback,
    report_master: {
      summary,
      suggested_code: llm?.suggested_code ?? null,
      materials_logic: (llm?.materials_logic ?? null) as AiMaterialsLogic | null,
      work_match: (llm?.work_match ?? null) as AiWorkMatch | null,
    },
    model: meta.model ?? (llm == null ? 'rules' : null),
    latency_ms: meta.latency_ms ?? null,
  };
}

/** A full ai_reviews row from an outcome (master fields empty). */
export function toAiReview(
  outcome: ReviewOutcome,
  row: { id: number; order_id: number; attempt: number; created_at: Timestamp },
): AiReview {
  return {
    ...row,
    ...outcome,
    master_verdict: null,
    master_score: null,
    master_comment: null,
    master_id: null,
    master_decided_at: null,
  };
}

// ---------------------------------------------------------------------------
// the mock judgement (MockApi, PHASE_0 §8)
// ---------------------------------------------------------------------------

export interface MockJudgementInput {
  order: Pick<Order, 'works_done' | 'fault_code' | 'suggested_fault_code'>;
  /** Number of after photos of the order. */
  after_photos: number;
}

/**
 * A deterministic stand in for the LLM: work_match full when the works text is over 20 characters (partial when
 * shorter, none when empty); the code is inconsistent when its fault group letter differs from the suggested
 * code's; photo score 4 when an after photo exists. feedback_worker and summary_master are left empty, so
 * aggregateReview builds them from the checks the way ai_submit does without them.
 */
export function mockJudgement(input: MockJudgementInput): LlmAnswerInput {
  const works = pgTrim(input.order.works_done ?? '');
  const len = charLength(works);
  const code = input.order.fault_code || null;
  const suggested = input.order.suggested_fault_code || null;
  const consistent = code == null || suggested == null || code.charAt(0) === suggested.charAt(0);
  const hasPhoto = input.after_photos > 0;
  return {
    work_match:
      len > 20
        ? { verdict: 'full', explanation: 'описание работ соответствует неисправности' }
        : len > 0
          ? { verdict: 'partial', explanation: 'описание работ слишком краткое' }
          : { verdict: 'none', explanation: 'работы не описаны' },
    code_consistent: consistent,
    suggested_code: consistent ? (code ?? suggested) : suggested,
    materials_logic: { verdict: 'ok', explanation: 'набор материалов соответствует работам' },
    photo: hasPhoto
      ? {
          after_present: true,
          same_equipment: 'yes',
          problem_resolved: 'yes',
          quality_issues: [],
          score_1_5: 4,
          explanation: 'неисправность на фото после не видна',
        }
      : {
          after_present: false,
          same_equipment: 'unsure',
          problem_resolved: 'not_applicable',
          quality_issues: [],
          score_1_5: 0,
          explanation: '',
        },
    confidence: hasPhoto ? 0.85 : 0.7,
    feedback_worker: null,
    summary_master: null,
  };
}

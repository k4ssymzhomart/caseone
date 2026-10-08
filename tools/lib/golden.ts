// The ai-verify golden set (CLAUDE.md §11): case files in supabase/functions/ai-verify/golden/*.json hold the
// facts of a closed order. This module turns a case into what production computes, with no I/O:
//   rules    = rulesChecks (the TypeScript mirror of internal.rules_checks)
//   context  = the shape of public.ai_context, so buildVerifyMessages sees exactly what ai-verify sees
//   outcome  = aggregateReview (the mirror of public.ai_submit): verdict, score, needs_master_review
// tools/golden.ts reads the files and calls the LLM; packages/shared/src/domain/verifyGolden.test.ts pins the
// reference answers.

import {
  aggregateReview,
  type AiCheck,
  type Directories,
  type LlmAnswerInput,
  type RulesOrder,
  type RulesPhoto,
  rulesChecks,
  type Verdict,
} from '@rota/shared';
import {
  bytesToBase64,
  mediaTypeForPath,
  pickVerifyPhotos,
  type VerifyContext,
  type VerifyPhoto,
} from '../../supabase/functions/_shared/verifyInput.ts';

export interface GoldenPhoto {
  kind: 'before' | 'after';
  /** Relative to the golden folder, for example photos/pump_leak_a.png. */
  file: string;
  source: 'camera' | 'gallery';
  captured_at: string;
  dhash: string | null;
  sha256: string | null;
}

export interface GoldenCase {
  case: string;
  /** The line of CLAUDE.md §11 «Golden set» this case covers. */
  spec: string;
  /** The pinned case in supabase/tests/ai_review.sql whose facts it reuses. */
  sql_case: string | null;
  title: string;
  /** verdict null: not checked (the unclear photo case only fixes needs_master_review). */
  expected: { verdict: Verdict | null; needs_master_review: boolean };
  why: string;
  order: {
    number: number;
    type: 'planned' | 'unplanned';
    priority: 'emergency' | 'high' | 'normal' | 'planned';
    equipment_id: number;
    assignee_tab_no: string;
    description: string;
    comment: string | null;
    suggested_fault_code: string | null;
    norm_hours: number | null;
    equipment_stopped: boolean;
    works_done: string | null;
    fault_code: string | null;
    closing_comment: string | null;
    created_at: string;
    started_at: string | null;
    done_at: string | null;
    due_at: string;
    paused_total_sec: number;
    is_demo: boolean;
  };
  materials: { material_id: number; qty: number }[];
  no_materials?: boolean;
  /** History p90 per material id (internal.material_p90); omitted: no history. */
  p90?: Record<string, number>;
  photos: GoldenPhoto[];
  /** Photos of earlier orders, for the duplicate check of R2. */
  other_photos?: {
    order_number: number;
    kind: 'before' | 'after';
    dhash: string;
    captured_at: string;
  }[];
  timeline: VerifyContext['timeline'];
  /** A plausible LLM answer that leads to the expected outcome (the pinned answer of the SQL case where one exists). */
  reference_llm: LlmAnswerInput;
}

export interface GoldenOutcome {
  verdict: Verdict;
  score: number;
  needs_master_review: boolean;
  confidence: number | null;
  checks: AiCheck[];
}

const ORDER_ID = 1;
const OTHER_ORDER_ID = 1000;

/** internal.rules_checks for the case. */
export function goldenRules(c: GoldenCase, dirs: Directories): AiCheck[] {
  const clientRef = `00000000-0000-4000-8000-${String(c.order.number).padStart(12, '0')}`;
  const order: RulesOrder = {
    id: ORDER_ID,
    client_ref: clientRef,
    type: c.order.type,
    works_done: c.order.works_done,
    fault_code: c.order.fault_code,
    norm_hours: c.order.norm_hours,
    started_at: c.order.started_at,
    done_at: c.order.done_at,
    due_at: c.order.due_at,
    paused_total_sec: c.order.paused_total_sec,
    is_demo: c.order.is_demo,
  };
  const own: RulesPhoto[] = c.photos.map((p, i) => ({
    id: i + 1,
    order_id: ORDER_ID,
    client_ref: clientRef,
    kind: p.kind,
    source: p.source,
    captured_at: p.captured_at,
    uploaded_at: p.captured_at,
    dhash: p.dhash,
    sha256: p.sha256,
  }));
  const others: RulesPhoto[] = (c.other_photos ?? []).map((p, i) => ({
    id: 100 + i,
    order_id: OTHER_ORDER_ID + i,
    client_ref: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
    kind: p.kind,
    source: 'camera',
    captured_at: p.captured_at,
    uploaded_at: p.captured_at,
    dhash: p.dhash,
    sha256: null,
  }));
  const numbers = new Map(
    (c.other_photos ?? []).map((p, i) => [OTHER_ORDER_ID + i, p.order_number]),
  );
  return rulesChecks({
    order,
    photos: [...own, ...others],
    orderNumber: (id) => numbers.get(id) ?? null,
    materials: c.materials,
    no_materials: c.no_materials ?? false,
    directories: dirs,
    p90: (materialId) => c.p90?.[String(materialId)] ?? null,
    now: new Date(c.order.done_at ?? c.order.due_at),
  });
}

/** public.ai_context for the case: people as pseudonyms, photo files as storage paths. */
export function goldenContext(c: GoldenCase, dirs: Directories, rules: AiCheck[]): VerifyContext {
  const eq = dirs.equipment.find((e) => e.id === c.order.equipment_id);
  const area = dirs.areas.find((a) => a.id === eq?.area_id);
  const worker = dirs.employees.find((e) => e.tab_no === c.order.assignee_tab_no);
  if (!eq || !area || !worker) throw new Error(`${c.case}: unknown equipment or worker`);
  const fault = dirs.fault_codes.find((f) => f.code === c.order.fault_code);
  const norm = dirs.work_norms.find((n) => n.fault_code === c.order.fault_code);
  const material = (id: number) => {
    const m = dirs.materials.find((x) => x.id === id);
    if (!m) throw new Error(`${c.case}: unknown material ${id}`);
    return m;
  };
  return {
    attempt: 1,
    already_reviewed: false,
    status: 'ai_review',
    order: {
      id: ORDER_ID,
      number: c.order.number,
      type: c.order.type,
      priority: c.order.priority,
      description: c.order.description,
      comment: c.order.comment,
      works_done: c.order.works_done,
      fault_code: c.order.fault_code,
      fault_name: fault?.name ?? null,
      suggested_fault_code: c.order.suggested_fault_code,
      closing_comment: c.order.closing_comment,
      created_at: c.order.created_at,
      started_at: c.order.started_at,
      done_at: c.order.done_at,
      due_at: c.order.due_at,
      paused_total_sec: c.order.paused_total_sec,
      norm_hours: c.order.norm_hours,
      is_demo: c.order.is_demo,
      equipment_stopped: c.order.equipment_stopped,
    },
    equipment: { name: eq.name, type: eq.type, criticality: eq.criticality, area: area.name },
    worker: { pseudonym: worker.pseudonym, specialty: worker.specialty, grade: worker.grade },
    norm: norm
      ? {
          hours: norm.norm_hours,
          typical: norm.typical.map((t) => ({
            material_id: t.material_id,
            material: material(t.material_id).name,
            unit: material(t.material_id).unit,
            qty: t.qty,
            qty_max: t.qty_max,
          })),
        }
      : null,
    materials: c.materials.map((m) => ({
      material_id: m.material_id,
      material: material(m.material_id).name,
      unit: material(m.material_id).unit,
      qty: m.qty,
      p90: c.p90?.[String(m.material_id)] ?? null,
    })),
    photos: c.photos.map((p) => ({
      kind: p.kind,
      storage_path: p.file,
      source: p.source,
      captured_at: p.captured_at,
      dhash: p.dhash,
      sha256: p.sha256,
      width: null,
      height: null,
    })),
    timeline: c.timeline,
    rules,
  };
}

/** The photos ai-verify would download (pickVerifyPhotos), read through `read`. */
export function goldenPhotos(
  ctx: VerifyContext,
  read: (file: string) => Uint8Array,
): VerifyPhoto[] {
  const { before, after } = pickVerifyPhotos(ctx);
  return [before, after]
    .filter((p): p is NonNullable<typeof p> => p !== null && !!p.storage_path)
    .map((p) => ({
      kind: p.kind,
      media_type: mediaTypeForPath(p.storage_path),
      data: bytesToBase64(read(p.storage_path as string)),
      source: p.source ?? null,
      captured_at: p.captured_at ?? null,
    }));
}

/** public.ai_submit's scoring of an answer (null: the rules only review). */
export function goldenOutcome(
  rules: readonly AiCheck[],
  answer: LlmAnswerInput | null,
  threshold = 0.6,
): GoldenOutcome {
  const r = aggregateReview(rules, answer, { threshold });
  return {
    verdict: r.verdict,
    score: r.score,
    needs_master_review: r.needs_master_review,
    confidence: r.confidence,
    checks: r.checks,
  };
}

/** True when the outcome meets the expectation (a null expected verdict is not checked). */
export function goldenMatches(expected: GoldenCase['expected'], got: GoldenOutcome): boolean {
  return (
    (expected.verdict === null || expected.verdict === got.verdict) &&
    expected.needs_master_review === got.needs_master_review
  );
}

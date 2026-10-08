// The LLM input of the completion check (CLAUDE.md §11, step 3), shared by ai-verify and tools/golden.ts, so
// the golden set measures exactly what production sends.
//
//   const ctx = await rpc('ai_context', { p_order_id })            // VerifyContext
//   const { before, after } = pickVerifyPhotos(ctx)                  // which Storage files to download
//   const photos = [...]                                             // VerifyPhoto[], base64 as stored (≤1600 px)
//   const { system, messages } = buildVerifyMessages(ctx, photos)
//   await llm.call({ purpose: 'verify', system, messages })          // createLlm redacts and audits
//
// Pure functions, web standard only: runs in Deno, Node and vitest. People appear as pseudonyms in the context;
// free text (description, works, comments) still goes through the privacy gateway inside createLlm.

import type { LlmContentPart, LlmImageMediaType, LlmMessage } from './llm.ts';
import { PROMPT_VERSION, SYSTEM_PROMPTS } from './prompts.ts';

/** Bump when the layout of the user message changes; ai-verify may store it next to PROMPT_VERSION. */
export const VERIFY_INPUT_VERSION = `${PROMPT_VERSION}.i1`;

// ---------------------------------------------------------------------------
// public.ai_context(p_order_id) (migration rota_ai_review)
// ---------------------------------------------------------------------------

export type VerifyPhotoKind = 'before' | 'after';
export type VerifyCheckStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export interface VerifyCheck {
  id: string;
  title?: string | null;
  status: VerifyCheckStatus;
  points: number;
  max: number;
  message_ru: string;
}

export interface VerifyContextOrder {
  id: number;
  number: number;
  type: 'planned' | 'unplanned';
  priority: 'emergency' | 'high' | 'normal' | 'planned';
  description: string;
  comment?: string | null;
  works_done?: string | null;
  fault_code?: string | null;
  fault_name?: string | null;
  suggested_fault_code?: string | null;
  closing_comment?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  done_at?: string | null;
  due_at?: string | null;
  paused_total_sec?: number | null;
  norm_hours?: number | null;
  is_demo?: boolean | null;
  equipment_stopped?: boolean | null;
}

export interface VerifyContextPhoto {
  kind: VerifyPhotoKind;
  storage_path: string | null;
  source?: 'camera' | 'gallery' | string | null;
  captured_at?: string | null;
  dhash?: string | null;
  sha256?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface VerifyContextMaterial {
  material_id: number;
  material: string;
  unit: string;
  qty: number;
  /** p90 of this material on closed orders with the same fault code (null below 5 samples). */
  p90?: number | null;
}

export interface VerifyNormMaterial {
  material_id: number;
  material: string;
  unit: string;
  qty: number;
  qty_max: number | null;
}

export interface VerifyTimelineEvent {
  at: string;
  action: string;
  from?: string | null;
  to?: string | null;
  reason?: string | null;
  comment?: string | null;
  /** Pseudonym, or SYSTEM. */
  actor: string;
}

export interface VerifyContext {
  attempt: number;
  already_reviewed: boolean;
  status: string;
  order: VerifyContextOrder;
  equipment: { name: string; type: string; criticality?: string | null; area: string };
  worker: { pseudonym: string; specialty?: string | null; grade?: number | null };
  norm: { hours: number | null; typical: VerifyNormMaterial[] | null } | null;
  materials: VerifyContextMaterial[];
  photos: VerifyContextPhoto[];
  timeline: VerifyTimelineEvent[];
  rules: VerifyCheck[];
}

/** A photo as the model receives it: the client compressed JPEG as stored, never resized here. */
export interface VerifyPhoto {
  kind: VerifyPhotoKind;
  media_type: LlmImageMediaType;
  /** Base64 without a data: prefix. */
  data: string;
  source?: string | null;
  captured_at?: string | null;
}

// ---------------------------------------------------------------------------
// photos
// ---------------------------------------------------------------------------

const byTime = (a: VerifyContextPhoto, b: VerifyContextPhoto): number =>
  Date.parse(a.captured_at ?? '') - Date.parse(b.captured_at ?? '') || 0;

/**
 * The two photos the model sees (§11: «before photo (if any), after photo (if any)»): the earliest before
 * photo, which shows the problem as reported, and the latest after photo, which shows the result.
 * Photos without a storage path are skipped.
 */
export function pickVerifyPhotos(ctx: Pick<VerifyContext, 'photos'>): {
  before: VerifyContextPhoto | null;
  after: VerifyContextPhoto | null;
} {
  const usable = (kind: VerifyPhotoKind): VerifyContextPhoto[] =>
    (ctx.photos ?? []).filter((p) => p.kind === kind && !!p.storage_path);
  const before = usable('before').sort(byTime);
  const after = usable('after').sort(byTime);
  return { before: before[0] ?? null, after: after[after.length - 1] ?? null };
}

/** Media type by file extension; the photo pipeline stores JPEG (§17). */
export function mediaTypeForPath(path: string | null | undefined): LlmImageMediaType {
  const ext = /\.([a-z0-9]+)$/i.exec(path ?? '')?.[1]?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

/** Base64 of raw bytes without Node's Buffer (Edge Functions have no Buffer). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// text
// ---------------------------------------------------------------------------

const TYPE_RU: Readonly<Record<string, string>> = { planned: 'плановый', unplanned: 'внеплановый' };
const PRIORITY_RU: Readonly<Record<string, string>> = {
  emergency: 'аварийный',
  high: 'высокий',
  normal: 'обычный',
  planned: 'плановый',
};
const SOURCE_RU: Readonly<Record<string, string>> = { camera: 'камера', gallery: 'галерея' };
const STATUS_MARK: Readonly<Record<string, string>> = {
  pass: '✓',
  warn: '!',
  fail: '✕',
  skipped: '·',
};
/** reject_t and pause_t labels (CLAUDE.md §6); other reasons are free text. */
const REASON_RU: Readonly<Record<string, string>> = {
  no_materials: 'Нет материалов',
  no_permit: 'Нет допуска',
  busy_emergency: 'Занят аварийным',
  equipment_running: 'Оборудование работает',
  waiting_parts: 'Ожидание запчастей',
  waiting_stop: 'Ожидание остановки',
  waiting_permit: 'Ожидание допуска',
  other: 'Другое',
};
const ACTION_RU: Readonly<Record<string, string>> = {
  create: 'выдан',
  accept: 'принят',
  queue: 'в очередь',
  reject: 'отклонён',
  start: 'начат',
  pause: 'пауза',
  resume: 'продолжен',
  complete: 'исполнен',
  review_started: 'на проверку ИИ',
  ai_result: 'результат ИИ',
  close: 'закрыт',
  return: 'возвращён мастером',
  resume_rework: 'доработка начата',
  reassign: 'переназначен',
  cancel: 'отменён',
  set_priority: 'приоритет',
  mark_reject_justified: 'отказ признан обоснованным',
};

/** «08.10 14:05» in Asia/Qostanay (fixed UTC+5, no Intl time zones). */
export function qostanayStamp(iso: string | null | undefined): string | null {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + 5 * 3600_000).toISOString();
  return `${d.slice(8, 10)}.${d.slice(5, 7)} ${d.slice(11, 16)}`;
}

/** «2 ч 10 мин», «45 мин». */
function duration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${Math.max(m, 1)} мин`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} ч ${rest} мин` : `${h} ч`;
}

/** Decimal comma, at most 2 digits: 0,5; 2; 1,25. */
function num(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '?';
  return String(Math.round(Number(v) * 100) / 100).replace('.', ',');
}

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** Work minutes: done − started − pauses (null without both marks). */
export function workMinutes(order: VerifyContextOrder): number | null {
  const s = Date.parse(order.started_at ?? '');
  const d = Date.parse(order.done_at ?? '');
  if (!Number.isFinite(s) || !Number.isFinite(d)) return null;
  return (d - s) / 60_000 - (order.paused_total_sec ?? 0) / 60;
}

/** The order facts as one Russian text block, the same for every provider. */
export function buildVerifyText(ctx: VerifyContext, photos: readonly VerifyPhoto[] = []): string {
  const o = ctx.order;
  const lines: string[] = [];
  const add = (label: string, value: string | null | undefined): void => {
    const v = clean(value);
    if (v) lines.push(`${label}: ${v}`);
  };

  lines.push(`НАРЯД №${o.number}, попытка ${ctx.attempt}`);
  add('Тип', `${TYPE_RU[o.type] ?? o.type}, приоритет ${PRIORITY_RU[o.priority] ?? o.priority}`);
  add(
    'Оборудование',
    `${ctx.equipment.name} (${ctx.equipment.type}${ctx.equipment.criticality ? `, критичность ${ctx.equipment.criticality}` : ''}), ${ctx.equipment.area}`,
  );
  if (o.equipment_stopped) lines.push('Оборудование было остановлено');
  add('Описание проблемы', o.description);
  add('Комментарий мастера', o.comment);
  if (o.suggested_fault_code) add('Шифр, предложенный при выдаче', o.suggested_fault_code);
  add(
    'Исполнитель',
    [
      ctx.worker.pseudonym,
      ctx.worker.specialty,
      ctx.worker.grade ? `${ctx.worker.grade} разряд` : null,
    ]
      .filter(Boolean)
      .join(', '),
  );

  lines.push('', 'ОТЧЁТ ИСПОЛНИТЕЛЯ');
  lines.push(`Выполненные работы: ${clean(o.works_done) || 'не заполнено'}`);
  lines.push(
    `Шифр неисправности: ${o.fault_code ? `${o.fault_code}${o.fault_name ? ` ${o.fault_name}` : ''}` : 'не указан'}`,
  );
  add('Комментарий исполнителя', o.closing_comment);

  lines.push('', 'МАТЕРИАЛЫ (списано; норма по шифру)');
  const typical = ctx.norm?.typical ?? [];
  if (ctx.materials.length === 0) lines.push('не списаны');
  for (const m of ctx.materials) {
    const t = typical.find((x) => x.material_id === m.material_id);
    const norm = t
      ? `норма ${num(t.qty)}, не более ${num(t.qty_max)} ${t.unit}`
      : ctx.norm?.typical
        ? 'не типовой для шифра'
        : 'норма для шифра не задана';
    const p90 = m.p90 !== null && m.p90 !== undefined ? `; обычно до ${num(m.p90)} ${m.unit}` : '';
    lines.push(`${m.material}: ${num(m.qty)} ${m.unit} (${norm}${p90})`);
  }
  const missing = typical.filter(
    (t) => !ctx.materials.some((m) => m.material_id === t.material_id),
  );
  if (missing.length > 0) {
    lines.push(
      `Ещё в типовом наборе шифра (по необходимости, не обязательно): ${missing.map((t) => `${t.material} ${num(t.qty)} ${t.unit}`).join(', ')}`,
    );
  }

  lines.push('', 'ВРЕМЯ');
  const work = workMinutes(o);
  const normHours = o.norm_hours ?? ctx.norm?.hours ?? null;
  add('Начало работ', qostanayStamp(o.started_at));
  add('Окончание работ', qostanayStamp(o.done_at));
  add('Срок', qostanayStamp(o.due_at));
  if (work !== null) {
    const paused = (o.paused_total_sec ?? 0) / 60;
    lines.push(
      `Чистое время работ: ${duration(work)}${paused >= 1 ? ` (паузы ${duration(paused)})` : ''}; норматив ${normHours !== null ? duration(Number(normHours) * 60) : 'не задан'}`,
    );
  }
  if (o.is_demo) lines.push('Демо наряд: короткие работы сравниваются с ускоренным нормативом');

  const notes = (ctx.timeline ?? []).filter(
    (e) => clean(e.comment) || (clean(e.reason) && e.action !== 'ai_result'),
  );
  if (notes.length > 0) {
    lines.push('', 'ХОД РАБОТ (комментарии)');
    for (const e of notes.slice(-8)) {
      const reason = clean(e.reason);
      const what = [REASON_RU[reason] ?? reason, clean(e.comment)].filter(Boolean).join(': ');
      lines.push(
        `${qostanayStamp(e.at) ?? ''} ${ACTION_RU[e.action] ?? e.action} ${e.actor}: ${what}`.trim(),
      );
    }
  }

  lines.push('', 'ФОТО');
  const shots = (kind: VerifyPhotoKind): string => {
    const list = (ctx.photos ?? []).filter((p) => p.kind === kind);
    if (list.length === 0) return 'нет';
    return list
      .map((p) =>
        [SOURCE_RU[p.source ?? ''] ?? p.source, qostanayStamp(p.captured_at)]
          .filter(Boolean)
          .join(', '),
      )
      .join('; ');
  };
  lines.push(`До: ${shots('before')}`);
  lines.push(`После: ${shots('after')}`);
  const attached = (kind: VerifyPhotoKind): boolean => photos.some((p) => p.kind === kind);
  lines.push(
    `Приложены к сообщению: ${
      [attached('before') ? 'фото до' : null, attached('after') ? 'фото после' : null]
        .filter(Boolean)
        .join(' и ') || 'нет'
    }`,
  );

  lines.push('', 'ДЕТЕРМИНИРОВАННЫЕ ПРОВЕРКИ (уже выполнены, не пересчитывай)');
  for (const c of ctx.rules ?? []) {
    lines.push(
      `${STATUS_MARK[c.status] ?? c.status} ${c.id} ${c.title ?? ''} ${c.points} из ${c.max}: ${clean(c.message_ru)}`.replace(
        /\s+/g,
        ' ',
      ),
    );
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------

export interface VerifyMessages {
  system: string;
  messages: LlmMessage[];
}

/**
 * System prompt and the one user message: the order text, then each attached photo after its label
 * (before first, then after). Pass at most one photo of each kind (pickVerifyPhotos); extra ones are kept
 * in order but cost tokens.
 */
export function buildVerifyMessages(
  ctx: VerifyContext,
  photos: readonly VerifyPhoto[] = [],
): VerifyMessages {
  const ordered = [...photos].sort((a, b) =>
    a.kind === b.kind ? 0 : a.kind === 'before' ? -1 : 1,
  );
  const content: LlmContentPart[] = [{ type: 'text', text: buildVerifyText(ctx, ordered) }];
  for (const p of ordered) {
    const meta = [SOURCE_RU[p.source ?? ''] ?? p.source, qostanayStamp(p.captured_at)]
      .filter(Boolean)
      .join(', ');
    content.push({
      type: 'text',
      text: `${p.kind === 'before' ? 'Фото до работ' : 'Фото после работ'}${meta ? ` (${meta})` : ''}:`,
    });
    content.push({ type: 'image', media_type: p.media_type, data: p.data });
  }
  content.push({ type: 'text', text: 'Оцени наряд и ответь строго по схеме JSON.' });
  return { system: SYSTEM_PROMPTS.verify, messages: [{ role: 'user', content }] };
}

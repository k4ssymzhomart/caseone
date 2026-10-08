// What ai-verify adds around the shared verify input builder (_shared/verifyInput.ts, also used by the golden set,
// so both measure the same input):
// - a guard on downloaded photo bytes (size cap, real image type) before they become a VerifyPhoto;
// - one extra note when a photo exists in the order but could not be sent (download failed or unusable file);
// - the privacy gateway on every text part before the call (createLlm redacts again: idempotent);
// - the check of the model's answer before it goes to ai_submit.
// Pure functions, no Deno or Node globals; photos are never resized here (2 s CPU limit, the client compressed them).

import type { LlmContentPart, LlmImageMediaType, LlmMessage } from '../_shared/llm.ts';
import { LlmError } from '../_shared/llm.ts';
import type { PrivacyDirectory } from '../_shared/privacy.ts';
import type { VerifyAnswer } from '../_shared/schemas.ts';
import {
  buildVerifyMessages,
  bytesToBase64,
  type VerifyContextPhoto,
  type VerifyMessages,
  type VerifyPhoto,
  type VerifyPhotoKind,
} from '../_shared/verifyInput.ts';

// ---------------------------------------------------------------------------
// photos
// ---------------------------------------------------------------------------

/** Anthropic accepts images up to 5 MB; base64 grows by 4/3, so the raw cap stays below 3.75 MB. */
export const MAX_IMAGE_BYTES = 3_700_000;

/** The type by magic bytes: the extension can lie, and a non-image would turn the whole call into a 400. */
export function sniffImageType(bytes: Uint8Array): LlmImageMediaType | null {
  const b = (i: number): number => bytes[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38) return 'image/gif';
  if (
    b(0) === 0x52 &&
    b(1) === 0x49 &&
    b(2) === 0x46 &&
    b(3) === 0x46 &&
    b(8) === 0x57 &&
    b(9) === 0x45 &&
    b(10) === 0x42 &&
    b(11) === 0x50
  )
    return 'image/webp';
  return null;
}

export type PhotoResult =
  | { ok: true; photo: VerifyPhoto; bytes: number }
  | { ok: false; kind: VerifyPhotoKind; reason: 'missing' | 'too_large' | 'unsupported' };

/** Downloaded bytes of a context photo → the VerifyPhoto the shared builder takes, or why it cannot be sent. */
export function photoFromBytes(meta: VerifyContextPhoto, bytes: Uint8Array | null): PhotoResult {
  if (!bytes || bytes.length === 0) return { ok: false, kind: meta.kind, reason: 'missing' };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, kind: meta.kind, reason: 'too_large' };
  const media_type = sniffImageType(bytes);
  if (!media_type) return { ok: false, kind: meta.kind, reason: 'unsupported' };
  return {
    ok: true,
    bytes: bytes.length,
    photo: {
      kind: meta.kind,
      media_type,
      data: bytesToBase64(bytes),
      source: meta.source ?? null,
      captured_at: meta.captured_at ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// the request
// ---------------------------------------------------------------------------

/** Appended only when a photo of the order could not be attached; absent in the normal case and in the golden set. */
export function unavailablePhotoNote(kinds: readonly VerifyPhotoKind[]): string | null {
  if (kinds.length === 0) return null;
  const what = [kinds.includes('before') ? 'до' : null, kinds.includes('after') ? 'после' : null]
    .filter(Boolean)
    .join(' и ');
  return `Фото ${what} есть в наряде, но изображение не удалось передать. Не считай его отсутствующим: оцени фото как «не уверен» и снизь confidence.`;
}

function redactParts(messages: LlmMessage[], directory: PrivacyDirectory | null): LlmMessage[] {
  if (!directory) return messages;
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === 'string'
        ? directory.redact(m.content)
        : m.content.map((p): LlmContentPart =>
            p.type === 'text' ? { type: 'text', text: directory.redact(p.text) } : p,
          ),
  }));
}

/**
 * The system prompt and the user message from the shared builder, plus the unavailable photo note,
 * with every text part through the privacy gateway. Spread the result into llm.call({ purpose: 'verify', ... }).
 */
export function buildVerifyRequest(
  ctx: Parameters<typeof buildVerifyMessages>[0],
  photos: readonly VerifyPhoto[],
  unavailable: readonly VerifyPhotoKind[],
  directory: PrivacyDirectory | null,
): VerifyMessages {
  const built = buildVerifyMessages(ctx, photos);
  const note = unavailablePhotoNote(unavailable);
  const messages = note
    ? built.messages.map((m) =>
        typeof m.content === 'string'
          ? { role: m.role, content: `${m.content}\n${note}` }
          : {
              role: m.role,
              content: [...m.content, { type: 'text', text: note } as LlmContentPart],
            },
      )
    : built.messages;
  return { system: built.system, messages: redactParts(messages, directory) };
}

// ---------------------------------------------------------------------------
// the answer
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | null =>
  typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : null;

/**
 * Checks the answer against the verify schema and returns it in the shape ai_submit reads.
 * Structured outputs already guarantee the shape with Anthropic; this guards the mock and on-prem providers.
 * Values pass through unchanged, except: score_1_5 becomes an integer 0..5 (ai_submit casts it to int)
 * and confidence is held to 0..1 (the threshold decision is the same either way).
 * A missing verdict field throws BAD_RESPONSE, which the retry policy treats as retryable.
 */
export function normalizeVerifyAnswer(value: unknown): VerifyAnswer {
  const bad = (what: string): never => {
    throw new LlmError('BAD_RESPONSE', `BAD_RESPONSE: verify answer without ${what}`);
  };
  if (!isObj(value)) return bad('an object');
  const wm = isObj(value.work_match) ? value.work_match : bad('work_match');
  const workVerdict =
    oneOf(wm.verdict, ['full', 'partial', 'none'] as const) ?? bad('work_match.verdict');
  const ml = isObj(value.materials_logic) ? value.materials_logic : null;
  const photo = isObj(value.photo) ? value.photo : bad('photo');
  const conf = Number(value.confidence);
  if (typeof value.confidence !== 'number' || !Number.isFinite(conf)) bad('confidence');
  const rawScore = Number(photo.score_1_5);
  const score = Number.isFinite(rawScore) ? Math.min(5, Math.max(0, Math.round(rawScore))) : 0;

  return {
    work_match: { verdict: workVerdict, explanation: str(wm.explanation) },
    code_consistent: value.code_consistent !== false,
    suggested_code: str(value.suggested_code),
    materials_logic: {
      verdict: oneOf(ml?.verdict, ['ok', 'suspicious'] as const) ?? 'ok',
      explanation: str(ml?.explanation),
    },
    photo: {
      after_present: photo.after_present === true,
      same_equipment: oneOf(photo.same_equipment, ['yes', 'no', 'unsure'] as const) ?? 'unsure',
      problem_resolved:
        oneOf(photo.problem_resolved, ['yes', 'no', 'unsure', 'not_applicable'] as const) ??
        'unsure',
      quality_issues: strList(photo.quality_issues),
      score_1_5: score,
      explanation: str(photo.explanation),
    },
    confidence: Math.min(1, Math.max(0, conf)),
    feedback_worker: {
      good: strList(isObj(value.feedback_worker) ? value.feedback_worker.good : null),
      improve: strList(isObj(value.feedback_worker) ? value.feedback_worker.improve : null),
    },
    summary_master: str(value.summary_master),
  };
}

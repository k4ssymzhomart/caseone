import { describe, expect, it } from 'vitest';
import directories from '../../seed/directories.json';
import type { LlmContentPart, LlmMessage } from '../_shared/llm.ts';
import { isLlmError, mockAnswer } from '../_shared/llm.ts';
import { buildDirectory } from '../_shared/privacy.ts';
import type { VerifyAnswer } from '../_shared/schemas.ts';
import { buildVerifyMessages, pickVerifyPhotos, type VerifyPhoto } from '../_shared/verifyInput.ts';
import {
  buildVerifyRequest,
  MAX_IMAGE_BYTES,
  normalizeVerifyAnswer,
  photoFromBytes,
  sniffImageType,
  unavailablePhotoNote,
} from './input.ts';
import { demoContext, jpegBytes, NAMES_IN_FIXTURE } from './test-fixtures.ts';

const directory = buildDirectory(directories.employees);

function demoPhotos(): VerifyPhoto[] {
  const pick = pickVerifyPhotos(demoContext());
  return [pick.before, pick.after].flatMap((meta) => {
    if (!meta) return [];
    const r = photoFromBytes(meta, jpegBytes(meta.kind === 'after' ? 4096 : 2048));
    return r.ok ? [r.photo] : [];
  });
}

const partsOf = (messages: LlmMessage[]): LlmContentPart[] => {
  const content = messages[0]?.content;
  if (typeof content === 'string' || !content) throw new Error('expected content parts');
  return content;
};

const textOf = (messages: LlmMessage[]): string =>
  partsOf(messages)
    .map((p) => (p.type === 'text' ? p.text : `[image ${p.media_type}]`))
    .join('\n');

describe('photo bytes', () => {
  const meta = demoContext().photos[1]!;

  it('recognizes jpeg, png, gif and webp by their magic bytes', () => {
    expect(sniffImageType(jpegBytes())).toBe('image/jpeg');
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe('image/png');
    expect(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif');
    expect(
      sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBe('image/webp');
    expect(sniffImageType(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]))).toBeNull(); // HEIC
  });

  it('turns a downloaded JPEG into a VerifyPhoto with base64 and the photo metadata', () => {
    const r = photoFromBytes(meta, jpegBytes(3000));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.photo).toMatchObject({
      kind: 'after',
      media_type: 'image/jpeg',
      source: 'camera',
      captured_at: meta.captured_at,
    });
    expect(atob(r.photo.data).length).toBe(3000);
    expect(r.bytes).toBe(3000);
  });

  it('says why a photo cannot be sent', () => {
    expect(photoFromBytes(meta, null)).toEqual({ ok: false, kind: 'after', reason: 'missing' });
    expect(photoFromBytes(meta, new Uint8Array(0))).toMatchObject({ reason: 'missing' });
    expect(photoFromBytes(meta, new Uint8Array(MAX_IMAGE_BYTES + 1))).toMatchObject({
      reason: 'too_large',
    });
    expect(photoFromBytes(meta, new Uint8Array([1, 2, 3, 4]))).toMatchObject({
      reason: 'unsupported',
    });
  });
});

describe('verify request', () => {
  it('is exactly the shared builder output when nothing is missing and no directory is given', () => {
    const ctx = demoContext();
    const photos = demoPhotos();
    expect(buildVerifyRequest(ctx, photos, [], null)).toEqual(buildVerifyMessages(ctx, photos));
  });

  it('keeps the shared layout: text, then the before photo, then the after photo', () => {
    const req = buildVerifyRequest(demoContext(), demoPhotos(), [], directory);
    const kinds = partsOf(req.messages).map((p) => p.type);
    expect(kinds).toEqual(['text', 'text', 'image', 'text', 'image', 'text']);
    const text = textOf(req.messages);
    expect(text.indexOf('Фото до работ')).toBeLessThan(text.indexOf('Фото после работ'));
    expect(req.system.length).toBeGreaterThan(100);
  });

  it('redacts every text part before the call: no directory name or tab number reaches the model', () => {
    const req = buildVerifyRequest(demoContext(), demoPhotos(), [], directory);
    const text = textOf(req.messages);
    for (const name of NAMES_IN_FIXTURE) expect(text).not.toContain(name);
    expect(text).toContain('E01');
    expect(text).toContain('E02');
    // the shared builder output still has them: the redaction is ai-verify's job
    const raw = textOf(buildVerifyMessages(demoContext(), demoPhotos()).messages);
    expect(raw).toContain('Ахметов');
  });

  it('leaves the photos untouched by the redaction', () => {
    const photos = demoPhotos();
    const images = partsOf(
      buildVerifyRequest(demoContext(), photos, [], directory).messages,
    ).filter((p) => p.type === 'image');
    expect(images.map((p) => (p.type === 'image' ? p.data : ''))).toEqual(
      photos.map((p) => p.data),
    );
  });

  it('adds one note when a photo exists but could not be sent', () => {
    const ctx = demoContext();
    const photos = demoPhotos().filter((p) => p.kind === 'before');
    const req = buildVerifyRequest(ctx, photos, ['after'], directory);
    const parts = partsOf(req.messages);
    expect(parts.filter((p) => p.type === 'image')).toHaveLength(1);
    expect(parts[parts.length - 1]).toEqual({
      type: 'text',
      text: unavailablePhotoNote(['after']),
    });
    expect(unavailablePhotoNote(['after'])).toContain('Фото после есть в наряде');
    expect(unavailablePhotoNote(['before', 'after'])).toContain('Фото до и после');
    expect(unavailablePhotoNote([])).toBeNull();
  });
});

describe('answer normalization', () => {
  const good: VerifyAnswer = {
    work_match: { verdict: 'full', explanation: 'Течь устранена' },
    code_consistent: true,
    suggested_code: 'Г-01',
    materials_logic: { verdict: 'ok', explanation: 'по норме' },
    photo: {
      after_present: true,
      same_equipment: 'yes',
      problem_resolved: 'yes',
      quality_issues: [],
      score_1_5: 5,
      explanation: 'масла нет',
    },
    confidence: 0.9,
    feedback_worker: { good: ['Течь устранена'], improve: [] },
    summary_master: 'Замечаний нет',
  };

  it('passes a schema valid answer through unchanged', () => {
    expect(normalizeVerifyAnswer(structuredClone(good))).toEqual(good);
    const mock = mockAnswer('verify', [{ role: 'user', content: 'Г-01' }], new Date());
    expect(normalizeVerifyAnswer(structuredClone(mock))).toEqual(mock);
  });

  it('makes score_1_5 an integer 0..5 and holds confidence to 0..1', () => {
    const odd = { ...good, confidence: 1.4, photo: { ...good.photo, score_1_5: 4.6 } };
    const n = normalizeVerifyAnswer(odd);
    expect(n.photo.score_1_5).toBe(5);
    expect(n.confidence).toBe(1);
  });

  it('drops NUL and lone surrogates, which jsonb cannot store, and keeps real surrogate pairs', () => {
    const odd = {
      ...good,
      summary_master: 'итог\u0000 ок\uD800',
      feedback_worker: { good: ['a\u0000b'], improve: ['\uDC00x \u{20000}'] },
    };
    const n = normalizeVerifyAnswer(odd);
    expect(n.summary_master).toBe('итог ок');
    expect(n.feedback_worker).toEqual({ good: ['ab'], improve: ['x \u{20000}'] });
  });

  it('throws a retryable BAD_RESPONSE when the verdict fields are missing', () => {
    const bads: unknown[] = [
      null,
      'text',
      {},
      { ...good, work_match: { verdict: 'maybe' } },
      { ...good, confidence: 'high' },
      { ...good, photo: null },
    ];
    for (const bad of bads) {
      let error: unknown;
      try {
        normalizeVerifyAnswer(bad);
      } catch (e) {
        error = e;
      }
      expect(isLlmError(error, 'BAD_RESPONSE')).toBe(true);
    }
  });
});

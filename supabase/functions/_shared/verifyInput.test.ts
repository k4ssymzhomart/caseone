import { describe, expect, it } from 'vitest';
import directories from '../../seed/directories.json';
import { createLlm, type LlmAuditRequest, type LlmContentPart } from './llm.ts';
import { buildDirectory, type DirectoryEmployee } from './privacy.ts';
import { SYSTEM_PROMPTS } from './prompts.ts';
import {
  buildVerifyMessages,
  buildVerifyText,
  bytesToBase64,
  mediaTypeForPath,
  pickVerifyPhotos,
  qostanayStamp,
  workMinutes,
  type VerifyContext,
  type VerifyPhoto,
} from './verifyInput.ts';

const ctx: VerifyContext = {
  attempt: 1,
  already_reviewed: false,
  status: 'ai_review',
  order: {
    id: 9,
    number: 412,
    type: 'unplanned',
    priority: 'emergency',
    description: 'Течь масла из под крышки насоса',
    comment: null,
    works_done: 'Заменил уплотнительное кольцо крышки, подтянул болты вместе с Ивановым',
    fault_code: 'Г-01',
    fault_name: 'Течь масла, повреждение РВД',
    suggested_fault_code: 'Г-01',
    closing_comment: 'Течи нет',
    created_at: '2026-10-08T08:40:00Z',
    started_at: '2026-10-08T09:00:00Z',
    done_at: '2026-10-08T10:30:00Z',
    due_at: '2026-10-08T11:00:00Z',
    paused_total_sec: 600,
    norm_hours: 1.5,
    is_demo: false,
    equipment_stopped: true,
  },
  equipment: {
    name: 'Насос НШ-32 маслостанции',
    type: 'насос',
    criticality: 'B',
    area: 'Участок обогащения',
  },
  worker: { pseudonym: 'E01', specialty: 'слесарь', grade: 5 },
  norm: {
    hours: 1.5,
    typical: [
      { material_id: 21, material: 'Кольцо уплотнительное', unit: 'шт', qty: 2, qty_max: 4 },
      { material_id: 17, material: 'Масло гидравлическое ВМГЗ', unit: 'л', qty: 3, qty_max: 6 },
    ],
  },
  materials: [
    { material_id: 21, material: 'Кольцо уплотнительное', unit: 'шт', qty: 2, p90: 3 },
    { material_id: 39, material: 'Ветошь', unit: 'кг', qty: 1, p90: null },
  ],
  photos: [
    {
      kind: 'after',
      storage_path: 'orders/r/after/2.jpg',
      source: 'camera',
      captured_at: '2026-10-08T10:29:00Z',
    },
    {
      kind: 'before',
      storage_path: 'orders/r/before/1.jpg',
      source: 'gallery',
      captured_at: '2026-10-08T08:35:00Z',
    },
    {
      kind: 'after',
      storage_path: 'orders/r/after/1.jpg',
      source: 'camera',
      captured_at: '2026-10-08T10:20:00Z',
    },
    { kind: 'before', storage_path: null, source: 'camera', captured_at: '2026-10-08T08:30:00Z' },
  ],
  timeline: [
    { at: '2026-10-08T08:40:00Z', action: 'create', actor: 'M01' },
    {
      at: '2026-10-08T09:20:00Z',
      action: 'pause',
      reason: 'waiting_parts',
      comment: 'ждём кольцо',
      actor: 'E01',
    },
    { at: '2026-10-08T10:30:00Z', action: 'complete', comment: 'Течи нет', actor: 'E01' },
  ],
  rules: [
    {
      id: 'R1',
      title: 'Полнота отчёта',
      status: 'pass',
      points: 20,
      max: 20,
      message_ru: 'отчёт заполнен',
    },
    {
      id: 'R2',
      title: 'Подлинность фото',
      status: 'pass',
      points: 10,
      max: 10,
      message_ru: 'фото камерой',
    },
    {
      id: 'R3',
      title: 'Материалы',
      status: 'warn',
      points: 12,
      max: 15,
      message_ru: 'материал не типовой для шифра Г-01: ветошь',
    },
    {
      id: 'R4',
      title: 'Время и срок',
      status: 'pass',
      points: 20,
      max: 20,
      message_ru: 'время 1 ч 20 мин',
    },
  ],
};

const jpeg = (kind: VerifyPhoto['kind']): VerifyPhoto => ({
  kind,
  media_type: 'image/jpeg',
  data: kind === 'before' ? 'QkVGT1JF' : 'QUZURVI=',
  source: 'camera',
  captured_at: '2026-10-08T10:29:00Z',
});

const parts = (content: string | LlmContentPart[]): LlmContentPart[] =>
  typeof content === 'string' ? [{ type: 'text', text: content }] : content;

describe('verify input', () => {
  it('picks the earliest before photo and the latest after photo with a storage path', () => {
    const { before, after } = pickVerifyPhotos(ctx);
    expect(before?.storage_path).toBe('orders/r/before/1.jpg');
    expect(after?.storage_path).toBe('orders/r/after/2.jpg');
    expect(pickVerifyPhotos({ photos: [] })).toEqual({ before: null, after: null });
  });

  it('formats times in Asia/Qostanay and counts work minus pauses', () => {
    expect(qostanayStamp('2026-10-08T09:05:00Z')).toBe('08.10 14:05');
    expect(qostanayStamp(null)).toBeNull();
    expect(workMinutes(ctx.order)).toBe(80);
  });

  it('writes every fact the model judges into one text block', () => {
    const text = buildVerifyText(ctx, [jpeg('after')]);
    for (const piece of [
      'НАРЯД №412',
      'внеплановый, приоритет аварийный',
      'Насос НШ-32 маслостанции (насос, критичность B), Участок обогащения',
      'Описание проблемы: Течь масла из под крышки насоса',
      'Шифр неисправности: Г-01 Течь масла, повреждение РВД',
      'Кольцо уплотнительное: 2 шт (норма 2, не более 4 шт; обычно до 3 шт)',
      'Ветошь: 1 кг (не типовой для шифра)',
      'Ещё в типовом наборе шифра (по необходимости, не обязательно): Масло гидравлическое ВМГЗ 3 л',
      'Чистое время работ: 1 ч 20 мин (паузы 10 мин); норматив 1 ч 30 мин',
      'пауза E01: Ожидание запчастей: ждём кольцо',
      'До: галерея, 08.10 13:35; камера, 08.10 13:30',
      'Приложены к сообщению: фото после',
      '! R3 Материалы 12 из 15: материал не типовой для шифра Г-01: ветошь',
    ]) {
      expect(text).toContain(piece);
    }
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it('builds the system prompt and one user message with the photos in order before, after', () => {
    const { system, messages } = buildVerifyMessages(ctx, [jpeg('after'), jpeg('before')]);
    expect(system).toBe(SYSTEM_PROMPTS.verify);
    expect(messages).toHaveLength(1);
    const content = parts(messages[0]!.content);
    expect(content.map((p) => p.type)).toEqual(['text', 'text', 'image', 'text', 'image', 'text']);
    expect(content[1]).toMatchObject({
      type: 'text',
      text: expect.stringMatching(/^Фото до работ/),
    });
    expect(content[2]).toMatchObject({ type: 'image', data: 'QkVGT1JF' });
    expect(content[3]).toMatchObject({
      type: 'text',
      text: expect.stringMatching(/^Фото после работ/),
    });
    expect(content[4]).toMatchObject({ type: 'image', data: 'QUZURVI=' });
  });

  it('says so when no photo is attached', () => {
    const { messages } = buildVerifyMessages({ ...ctx, photos: [], materials: [] });
    const text = parts(messages[0]!.content)[0];
    expect(text).toMatchObject({ type: 'text' });
    expect((text as { text: string }).text).toContain('Приложены к сообщению: нет');
    expect((text as { text: string }).text).toContain(
      'МАТЕРИАЛЫ (списано; норма по шифру)\nне списаны',
    );
  });

  it('encodes bytes and guesses the media type without Node APIs', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
    const back = Uint8Array.from(atob(bytesToBase64(bytes)), (c) => c.charCodeAt(0));
    expect(back).toEqual(bytes);
    expect(bytesToBase64(new TextEncoder().encode('Rota'))).toBe('Um90YQ==');
    expect(mediaTypeForPath('orders/x/after/a.jpg')).toBe('image/jpeg');
    expect(mediaTypeForPath('a.PNG')).toBe('image/png');
    expect(mediaTypeForPath(null)).toBe('image/jpeg');
  });

  it('goes through the privacy gateway and the mock provider as ai-verify sends it', async () => {
    const rows: LlmAuditRequest[] = [];
    const llm = createLlm({
      provider: 'mock',
      privacy: buildDirectory((directories as { employees: DirectoryEmployee[] }).employees),
      audit: { start: (row) => (rows.push(row), 1), finish: () => undefined },
    });
    const r = await llm.call({ purpose: 'verify', ...buildVerifyMessages(ctx, [jpeg('after')]) });
    expect(r.data.photo.after_present).toBe(true);
    expect(r.data.suggested_code).toBe('Г-01');
    const audited = JSON.stringify(rows[0]?.request_redacted);
    expect(audited).not.toContain('Иванов');
    expect(audited).toContain('E02');
    expect(audited).not.toContain('QUZURVI=');
  });
});

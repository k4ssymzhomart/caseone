// Shared fixtures for the ai-verify tests: the demo order of step 5 (Насос НШ-32, Г-01) as public.ai_context returns it.

import type { VerifyContext } from '../_shared/verifyInput.ts';

/** A tiny but valid JPEG header followed by filler bytes. */
export function jpegBytes(size = 2048): Uint8Array {
  const b = new Uint8Array(size);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  for (let i = 10; i < size; i++) b[i] = (i * 31) % 256;
  return b;
}

export function demoContext(overrides: Partial<VerifyContext> = {}): VerifyContext {
  return {
    attempt: 1,
    already_reviewed: false,
    status: 'ai_review',
    order: {
      id: 9001,
      number: 147,
      type: 'unplanned',
      priority: 'emergency',
      description: 'Течь масла',
      comment: 'Течь под крышкой насоса, сообщил Ахметов Ерлан, таб. 2001',
      works_done: 'Заменил уплотнительное кольцо крышки, подтянул болты, протёр корпус',
      fault_code: 'Г-01',
      fault_name: 'Течь масла, повреждение РВД',
      suggested_fault_code: 'Г-01',
      closing_comment: 'Проверил с Иванов С., течи нет',
      created_at: '2026-10-16T05:00:00Z',
      started_at: '2026-10-16T05:03:00Z',
      done_at: '2026-10-16T05:06:00Z',
      due_at: '2026-10-16T07:00:00Z',
      paused_total_sec: 0,
      norm_hours: 1.5,
      is_demo: true,
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
        { material_id: 20, material: 'Рукав высокого давления', unit: 'шт', qty: 1, qty_max: 2 },
        { material_id: 39, material: 'Ветошь', unit: 'кг', qty: 1, qty_max: 2 },
      ],
    },
    materials: [
      { material_id: 21, material: 'Кольцо уплотнительное', unit: 'шт', qty: 2, p90: 3 },
      { material_id: 17, material: 'Масло гидравлическое ВМГЗ', unit: 'л', qty: 2, p90: 4.5 },
      { material_id: 39, material: 'Ветошь', unit: 'кг', qty: 1, p90: null },
    ],
    photos: [
      {
        kind: 'before',
        storage_path: 'orders/aaaa/before/1.jpg',
        source: 'camera',
        captured_at: '2026-10-16T04:59:00Z',
        dhash: '0f0f0f0f0f0f0f0f',
        sha256: 'a'.repeat(64),
        width: 1600,
        height: 1200,
      },
      {
        kind: 'after',
        storage_path: 'orders/aaaa/after/2.jpg',
        source: 'camera',
        captured_at: '2026-10-16T05:05:30Z',
        dhash: 'f0f0f0f0f0f0f0f0',
        sha256: 'b'.repeat(64),
        width: 1600,
        height: 1200,
      },
    ],
    timeline: [
      {
        at: '2026-10-16T05:00:00Z',
        action: 'create',
        from: null,
        to: 'issued',
        reason: null,
        comment: 'Течь под крышкой насоса, сообщил Ахметов Ерлан, таб. 2001',
        actor: 'M01',
      },
      {
        at: '2026-10-16T05:01:00Z',
        action: 'accept',
        from: 'issued',
        to: 'accepted',
        reason: null,
        comment: null,
        actor: 'E01',
      },
      {
        at: '2026-10-16T05:04:00Z',
        action: 'pause',
        from: 'in_progress',
        to: 'paused',
        reason: 'waiting_parts',
        comment: 'Жду кольцо, звонил Жумабаеву',
        actor: 'E01',
      },
      {
        at: '2026-10-16T05:06:00Z',
        action: 'complete',
        from: 'in_progress',
        to: 'done',
        reason: null,
        comment: 'Проверил с Иванов С., течи нет',
        actor: 'E01',
      },
    ],
    rules: [
      {
        id: 'R1',
        title: 'Полнота отчёта',
        status: 'pass',
        points: 20,
        max: 20,
        message_ru: 'отчёт заполнен, шифр и материалы указаны',
      },
      {
        id: 'R2',
        title: 'Подлинность фото',
        status: 'pass',
        points: 10,
        max: 10,
        message_ru: 'фото сделано камерой во время работ',
      },
      {
        id: 'R3',
        title: 'Материалы',
        status: 'pass',
        points: 15,
        max: 15,
        message_ru: 'материалы в пределах нормы',
      },
      {
        id: 'R4',
        title: 'Время и срок',
        status: 'pass',
        points: 20,
        max: 20,
        message_ru: 'время 3 мин при нормативе 3 мин',
      },
    ],
    ...overrides,
  };
}

/** Real names that appear in demoContext free text; none of them may reach the LLM. */
export const NAMES_IN_FIXTURE = ['Ахметов', 'Ерлан', 'Иванов', 'Жумабаев', '2001'];

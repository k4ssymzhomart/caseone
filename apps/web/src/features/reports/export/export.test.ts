import type { AiReview, Directories, OrderDetail, OrderPhoto, RatingRow, ShiftReport } from '@rota/shared';
import { describe, expect, it } from 'vitest';
import { orderReportPdf, pdfPhotos } from '../../orders/orderExport';
import { filterText } from '../format';
import { fileStamp } from './files';
import { ratingPdf, ratingSheets } from './ratingExport';
import { shiftReportPdf, shiftReportSheets, summaryMeta, type ShiftExportInput } from './shiftExport';

/** Every text of a pdfmake content tree, joined: what the reader of the PDF will see. */
function texts(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(texts).join(' ');
  if (typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>)
      .filter(([k]) => !['style', 'color', 'alignment', 'layout', 'widths', 'svg', 'image', 'margin', 'fit'].includes(k))
      .map(([, v]) => texts(v))
      .join(' ');
  }
  return '';
}

const REPORT: ShiftReport = {
  period: { from: '2026-10-09T03:00:00Z', to: '2026-10-09T15:00:00Z' },
  counts: {
    issued: 9,
    accepted: 8,
    done: 7,
    closed: 5,
    overdue: 1,
    rejected: 2,
    rework: 1,
    cancelled: 0,
    active_now: 7,
  },
  rejected_reasons: [
    { reason: 'no_permit', count: 1 },
    { reason: null, count: 1 },
  ],
  workload: [{ employee_id: 'w2', short_name: 'Иванов С.', busy_min: 150, share: 0.42 }],
  downtime: [{ equipment_id: 12, name: 'Конвейер К-2', hours: 4.4, orders: 1 }],
  downtime_hours: 11.6,
  reaction_avg_min: 2.9,
  execution_avg_min: 114,
  on_time_share: 1,
  verdicts: { accepted: 3, rework: 1 },
  master_overrides: 1,
  top_issues: [{ code: 'Г-01', name: 'Течь масла, повреждение РВД', count: 2 }],
  top_equipment: [{ equipment_id: 20, name: 'Насос НШ-32 маслостанции', count: 2 }],
};

const INPUT: ShiftExportInput = {
  report: REPORT,
  overdue: [
    {
      number: 652,
      equipment: 'Конвейер К-1',
      area: 'Участок дробления',
      assignee: 'Петренко В.',
      status: 'В работе',
      due: '09.10 13:00',
      lateMin: 72,
    },
  ],
  summary: {
    summary: 'За смену выдано 9 нарядов, исполнено 7.',
    recommendations: ['Проверить насос НШ-32.', 'Разобрать просрочку №652.', 'Закрыть наряды.'],
    source: 'llm',
    model: 'claude-sonnet-5-5',
    generated_at: '2026-10-09T09:05:00Z',
  },
  periodText: 'Смена · День · 09.10 · с 08:00 до 20:00',
  filterText: 'Все участки, оборудование и исполнители',
  generatedAt: new Date('2026-10-09T09:06:00Z'),
};

describe('shift report export', () => {
  it('writes every section of the page into the PDF', () => {
    const doc = shiftReportPdf(INPUT);
    const all = texts(doc.content);
    expect(doc.pageSize).toBe('A4');
    expect(doc.defaultStyle?.font).toBe('Roboto');
    expect(all).toContain('Отчёт смены');
    expect(all).toContain('СМЕНА · ДЕНЬ · 09.10 · С 08:00 ДО 20:00');
    expect(all).toContain('Сформировано 09.10.2026 14:06');
    expect(all).toContain('За смену выдано 9 нарядов, исполнено 7.');
    expect(all).toContain('Разобрать просрочку №652.');
    expect(all).toContain('Модель claude-sonnet-5-5, 14:05');
    expect(all).toContain('Иванов С.');
    expect(all).toContain('Конвейер К-2');
    expect(all).toContain('№652');
    expect(all).toContain('1 ч 12 мин');
    expect(all).toContain('Без причины');
    expect(all).toContain('Г-01');
    expect(all).toContain('Насос НШ-32 маслостанции');
    // footer «Стр. N из M»
    const footer = (doc.footer as (p: number, n: number) => unknown)(2, 3);
    expect(texts(footer)).toContain('Стр. 2 из 3');
  });

  it('leaves the AI summary out when there is none and says what is empty', () => {
    const empty: ShiftReport = {
      ...REPORT,
      workload: [],
      downtime: [],
      rejected_reasons: [],
      verdicts: {},
      top_issues: [],
      top_equipment: [],
    };
    const all = texts(shiftReportPdf({ ...INPUT, report: empty, summary: null, overdue: [] }).content);
    expect(all).not.toContain('Сводка ИИ');
    expect(all).toContain('Просрочек нет');
    expect(all).toContain('Оборудование не останавливалось');
    expect(all).toContain('ИИ ещё не проверял наряды за период');
  });

  it('keeps numbers as numbers in the Excel sheets', () => {
    const sheets = shiftReportSheets(INPUT);
    expect(sheets.map((x) => x.name)).toEqual([
      'Сводка',
      'Сводка ИИ',
      'Загрузка',
      'Простой',
      'Просрочки',
      'Отказы',
      'Проверка ИИ',
      'Неисправности',
      'Оборудование',
    ]);
    const summary = sheets[0];
    expect(summary?.title).toEqual(['Отчёт смены', INPUT.periodText, INPUT.filterText]);
    expect(summary?.rows.find((r) => r.label === 'Выдано')?.value).toBe(9);
    expect(summary?.rows.find((r) => r.label === 'Выполнено в срок')?.value).toBe(100);
    expect(summary?.rows.find((r) => r.label === 'Простой оборудования')).toMatchObject({ value: 11.6, unit: 'ч' });
    expect(sheets[2]?.rows).toEqual([{ name: 'Иванов С.', busy: 150, share: 0.42 }]);
    expect(sheets[2]?.columns.find((c) => c.key === 'share')?.numFmt).toBe('0%');
    expect(sheets[4]?.rows[0]).toMatchObject({ number: 652, late: 72, area: 'Участок дробления' });
    expect(sheets[6]?.rows).toEqual([
      { verdict: 'Принято', count: 3 },
      { verdict: 'Принято с замечаниями', count: 0 },
      { verdict: 'Требует доработки', count: 1 },
    ]);
    expect(shiftReportSheets({ ...INPUT, summary: null }).map((x) => x.name)).not.toContain('Сводка ИИ');
  });

  it('names the source of the summary', () => {
    expect(summaryMeta({ summary: 'x', recommendations: [], source: 'rules' })).toBe(
      'Собрано по цифрам отчёта без модели ИИ',
    );
    expect(summaryMeta({ summary: 'x', recommendations: [] })).toBe('Тестовые данные');
  });
});

const row = (over: Partial<RatingRow>): RatingRow => ({
  kind: 'worker',
  id: 'w',
  name: 'Ахметов Е.',
  brigade_id: 1,
  closed: 20,
  q: 0.86,
  t: 0.92,
  f: 0.9,
  v: 0.7,
  d: 1,
  score: 88.1,
  rank: 1,
  note: null,
  ...over,
});

describe('rating export', () => {
  const rows: RatingRow[] = [
    row({ id: 'none', name: 'Есенов А.', closed: 0, q: null, t: null, f: null, score: null, rank: 15, note: 'нет закрытых нарядов' }),
    row({ id: 's', name: 'Сериков Д.', brigade_id: 2, f: 0.752, score: 74.8, rank: 14 }),
    row({ id: 'a' }),
    { ...row({ id: '1', name: 'Бригада 1', score: 86, rank: 1 }), kind: 'brigade' },
  ];
  const input = {
    rows,
    brigadeNames: new Map([
      [1, 'Бригада 1'],
      [2, 'Бригада 2'],
    ]),
    periodText: 'Месяц · с 09.09 01:00 по 09.10 01:00',
    filterText: 'Все участки, оборудование и исполнители',
    generatedAt: new Date('2026-10-09T09:06:00Z'),
  };

  it('writes workers and brigades, scored first, shares as fractions', () => {
    const [workers, brigades] = ratingSheets(input);
    expect(workers?.rows.map((r) => r.name)).toEqual(['Ахметов Е.', 'Сериков Д.', 'Есенов А.']);
    expect(workers?.rows[1]).toMatchObject({ rank: 14, brigade: 'Бригада 2', f: 0.752, score: 74.8, note: '' });
    expect(workers?.rows[2]).toMatchObject({ rank: null, score: null, note: 'нет закрытых нарядов' });
    expect(workers?.columns.find((c) => c.key === 'f')).toMatchObject({ header: 'F С первого раза, 20%', numFmt: '0.0%' });
    expect(brigades?.rows).toHaveLength(1);
    expect(brigades?.columns.some((c) => c.key === 'brigade')).toBe(false);
  });

  it('prints the rating table', () => {
    const all = texts(ratingPdf(input).content);
    expect(all).toContain('Рейтинг');
    expect(all).toContain('Сериков Д.');
    expect(all).toContain('75%');
    expect(all).toContain('74,8');
    expect(all).toContain('нет закрытых нарядов');
  });
});

describe('order report export', () => {
  const photo = (id: number, kind: OrderPhoto['kind'], at: string): OrderPhoto =>
    ({ id, kind, storage_path: `orders/r/${kind}/${id}.jpg`, captured_at: at, uploaded_at: at }) as OrderPhoto;

  it('picks the first before and the last after photo', () => {
    const p = pdfPhotos([
      photo(1, 'after', '2026-10-09T05:00:00Z'),
      photo(2, 'before', '2026-10-09T03:10:00Z'),
      photo(3, 'after', '2026-10-09T05:30:00Z'),
      photo(4, 'before', '2026-10-09T03:00:00Z'),
    ]);
    expect(p.before?.id).toBe(4);
    expect(p.after?.id).toBe(3);
    expect(pdfPhotos([])).toEqual({ before: null, after: null });
  });

  const review: AiReview = {
    id: 9,
    order_id: 1,
    attempt: 1,
    verdict: 'rework',
    score: 55,
    score5: 3,
    confidence: 0.9,
    needs_master_review: false,
    checks: [
      { id: 'R1', title: 'Полнота', status: 'fail', points: 10, max: 20, message_ru: 'нет фото после: обязательно для внеплановых работ' },
      { id: 'R3', title: 'Материалы', status: 'fail', points: 0, max: 15, message_ru: 'перерасход: подшипник 6 шт при норме до 2' },
    ],
    photo: null,
    feedback_worker: null,
    report_master: { summary: 'Фото после нет, перерасход подшипников.' },
    model: 'claude-sonnet-5-5',
    latency_ms: 8000,
    created_at: '2026-10-09T05:00:00Z',
    master_verdict: null,
    master_score: null,
    master_comment: null,
    master_id: null,
    master_decided_at: null,
  } as AiReview;

  const detail = {
    order: {
      id: 1,
      number: 640,
      type: 'unplanned',
      priority: 'normal',
      status: 'rework',
      description: 'Конвейер К-2: шум подшипника',
      comment: null,
      equipment_id: 12,
      equipment_name: 'Конвейер К-2',
      area_name: 'Участок дробления',
      assignee_id: 'w2',
      assignee_short_name: 'Иванов С.',
      brigade_name: null,
      master_short_name: 'Жумабаев Н.',
      due_at: '2026-10-09T09:00:00Z',
      issued_at: '2026-10-09T02:00:00Z',
      created_at: '2026-10-09T02:00:00Z',
      started_at: '2026-10-09T02:30:00Z',
      done_at: '2026-10-09T05:00:00Z',
      cancelled_at: null,
      paused_total_sec: 0,
      equipment_stopped: true,
      works_done: 'Заменил подшипники приводного барабана',
      fault_code: 'М-02',
      suggested_fault_code: null,
      norm_hours: 3,
      closing_comment: null,
      final_verdict: null,
      final_score: null,
      rework_count: 1,
    },
    events: [
      {
        id: 1,
        order_id: 1,
        actor_id: 'm1',
        action: 'create',
        from_status: null,
        to_status: 'issued',
        reason: null,
        comment: null,
        payload: { assignee_id: 'w2' },
        created_at: '2026-10-09T02:00:00Z',
      },
    ],
    photos: [],
    materials: [{ id: 1, order_id: 1, material_id: 1, material_name: 'Подшипник 22320', unit: 'шт', qty: 6 }],
    reviews: [review],
  } as unknown as OrderDetail;
  const dirs = {
    employees: [
      { id: 'w2', short_name: 'Иванов С.' },
      { id: 'm1', short_name: 'Жумабаев Н.' },
    ],
    brigades: [],
    fault_codes: [{ code: 'М-02', name: 'Подшипник: перегрев, шум, разрушение' }],
    work_norms: [{ fault_code: 'М-02', norm_hours: 3, typical: [{ material_id: 1, qty: 1, qty_max: 2 }] }],
  } as unknown as Directories;

  it('prints the card, the checks, materials against the norm, photos and the timeline', () => {
    const doc = orderReportPdf({
      detail,
      dirs,
      photos: { before: null, after: 'data:image/jpeg;base64,AAAA' },
      generatedAt: new Date('2026-10-09T06:00:00Z'),
    });
    const all = texts(doc.content);
    expect(all).toContain('Наряд №640');
    expect(all).toContain('Конвейер К-2');
    expect(all).toContain('55');
    expect(all).toContain('Требует доработки');
    expect(all).toContain('Нет фото после: обязательно для внеплановых работ');
    expect(all).toContain('Нарушение');
    expect(all).toContain('М-02 Подшипник: перегрев, шум, разрушение');
    expect(all).toContain('2 ч 30 мин при нормативе 3 ч');
    expect(all).toContain('6 шт');
    expect(all).toContain('Перерасход');
    expect(all).toContain('Фото до нет');
    expect(all).toContain('Наряд выдан');
    expect(all).toContain('Исполнитель Иванов С.');
    expect(JSON.stringify(doc.content)).toContain('data:image/jpeg;base64,AAAA');
  });
});

describe('helpers', () => {
  it('writes the filter line and file stamps', () => {
    const d = {
      areas: [{ id: 2, name: 'Участок дробления' }],
      equipment: [],
      brigades: [{ id: 1, name: 'Бригада 1' }],
      employees: [],
    } as unknown as Directories;
    expect(filterText({}, d)).toBe('Все участки, оборудование и исполнители');
    expect(filterText({ area_id: 2, brigade_id: 1 }, d)).toBe('Фильтр: участок «Участок дробления», Бригада 1');
    expect(fileStamp('2026-10-09T03:00:00Z')).toBe('2026-10-09-0800');
  });
});

import { describe, expect, it } from 'vitest';
import { fixtureDirectories } from '../fixtures';
import type { AiLlmAnswer, MaterialLine } from './types';
import {
  aggregateReview,
  dhashDistance,
  materialP90Lookup,
  mockJudgement,
  percentileCont,
  pgRound,
  ruDuration,
  ruNumeric,
  rulesChecks,
  RULES_ONLY_META,
  score5Of,
  timeVsNorm,
  toAiReview,
  type RulesInput,
  type RulesOrder,
  type RulesPhoto,
} from './verifyRules';

// The cases mirror supabase/tests/ai_review.sql (test.make_done): the order is created and completed at NOW,
// started `work` minutes earlier, the deadline is NOW + the suggested code's norm, the after photo is taken a
// minute before completion.
const NOW = new Date('2026-10-08T10:00:00Z');
const at = (minFromNow: number): string => new Date(NOW.getTime() + minFromNow * 60_000).toISOString();
const dirs = fixtureDirectories();
const NORM_MIN: Record<string, number> = { 'Г-01': 90, 'М-02': 180, 'Э-03': 60, 'С-01': 30 };

let photoId = 0;
function afterPhoto(over: Partial<RulesPhoto> = {}): RulesPhoto {
  photoId += 1;
  return {
    id: photoId,
    order_id: 1,
    client_ref: 'ref-1',
    kind: 'after',
    source: 'camera',
    captured_at: at(-1),
    uploaded_at: at(-1),
    dhash: '0f0f0f0f0f0f0f0f',
    sha256: `sha-${photoId}`,
    ...over,
  };
}

interface Case {
  code: string;
  type?: 'planned' | 'unplanned';
  works: string;
  materials: MaterialLine[];
  photos?: RulesPhoto[];
  work?: number;
  order?: Partial<RulesOrder>;
  extra?: Partial<RulesInput>;
}

function input(c: Case): RulesInput {
  const norm = NORM_MIN[c.code] ?? 60;
  return {
    order: {
      id: 1,
      client_ref: 'ref-1',
      type: c.type ?? 'unplanned',
      works_done: c.works,
      fault_code: c.code,
      norm_hours: norm / 60,
      started_at: at(-(c.work ?? 60)),
      done_at: at(0),
      due_at: at(norm),
      paused_total_sec: 0,
      is_demo: false,
      ...c.order,
    },
    photos: c.photos ?? [],
    materials: c.materials,
    directories: dirs,
    now: NOW,
    ...c.extra,
  };
}

const GOOD_LLM: AiLlmAnswer = {
  work_match: { verdict: 'full', explanation: 'Течь устранена заменой кольца' },
  code_consistent: true,
  suggested_code: 'Г-01',
  materials_logic: { verdict: 'ok', explanation: 'по норме' },
  photo: {
    after_present: true,
    same_equipment: 'yes',
    problem_resolved: 'yes',
    quality_issues: [],
    score_1_5: 5,
    explanation: 'масла нет, крышка чистая',
  },
  confidence: 0.9,
  feedback_worker: { good: ['Течь устранена'], improve: [] },
  summary_master: 'Течь устранена, замечаний нет',
};

const RING_WORKS = 'Заменил уплотнительное кольцо крышки, подтянул болты';

describe('rulesChecks', () => {
  it('a good closure passes every rule (G1) and scores 100 with a good LLM answer', () => {
    const rules = rulesChecks(
      input({
        code: 'Г-01',
        works: RING_WORKS,
        materials: [
          { material_id: 21, qty: 2 },
          { material_id: 17, qty: 2 },
          { material_id: 39, qty: 1 },
        ],
        photos: [afterPhoto()],
        work: 80,
      }),
    );
    expect(rules).toEqual([
      { id: 'R1', title: 'Полнота отчёта', status: 'pass', points: 20, max: 20, message_ru: 'отчёт заполнен, шифр и материалы указаны' },
      { id: 'R2', title: 'Подлинность фото', status: 'pass', points: 10, max: 10, message_ru: 'фото сделано камерой во время работ' },
      { id: 'R3', title: 'Материалы', status: 'pass', points: 15, max: 15, message_ru: 'материалы в пределах нормы' },
      { id: 'R4', title: 'Время и срок', status: 'pass', points: 20, max: 20, message_ru: 'время 1 ч 20 мин при нормативе 1 ч 30 мин' },
    ]);
    const review = aggregateReview(rules, GOOD_LLM, { meta: { model: 'claude-sonnet-5-5', latency_ms: 9000 } });
    expect(review.verdict).toBe('accepted');
    expect(review.score).toBe(100);
    expect(review.score5).toBe(5);
    expect(review.needs_master_review).toBe(false);
    expect(review.checks.map((c) => c.id)).toEqual(['R1', 'R2', 'R3', 'R4', 'L1', 'L2']);
    expect(review.report_master?.summary).toBe('Течь устранена, замечаний нет');
    expect(review.feedback_worker).toEqual({ good: ['Течь устранена'], improve: [] });
    expect(review.model).toBe('claude-sonnet-5-5');
  });

  it('no after photo on an unplanned order fails R1 (G2)', () => {
    const rules = rulesChecks(
      input({
        code: 'М-02',
        works: 'Заменил подшипник, смазал узел',
        materials: [
          { material_id: 2, qty: 1 },
          { material_id: 18, qty: 0.5 },
        ],
        work: 120,
      }),
    );
    expect(rules[0]).toMatchObject({
      status: 'fail',
      points: 0,
      message_ru: 'нет фото после: обязательно для внеплановых работ',
    });
    expect(rules[1]).toMatchObject({ status: 'warn', points: 5, message_ru: 'фото после нет, подлинность не проверялась' });
    const review = aggregateReview(rules, GOOD_LLM);
    expect(review.verdict).toBe('rework');
    expect(review.needs_master_review).toBe(false);
  });

  it('6 bearings against max 2 fails R3 with the SQL message (G3, demo step 7)', () => {
    const rules = rulesChecks(
      input({ code: 'М-02', works: 'Заменил подшипники', materials: [{ material_id: 2, qty: 6 }], work: 150 }),
    );
    expect(rules[0]?.message_ru).toBe('нет фото после: обязательно для внеплановых работ');
    expect(rules[2]).toMatchObject({
      status: 'fail',
      points: 0,
      message_ru: 'перерасход: подшипник 3626 6 шт при норме до 2',
    });
    const review = aggregateReview(rules, null);
    expect(review.verdict).toBe('rework');
    expect(review.needs_master_review).toBe(false);
    expect(review.report_master?.summary).toBe(
      'Требует доработки, 38 баллов. нет фото после: обязательно для внеплановых работ; перерасход: подшипник 3626 6 шт при норме до 2.',
    );
  });

  it('a photo of another order fails R2 (G4)', () => {
    const other = afterPhoto({ order_id: 7, client_ref: 'ref-7', dhash: '0f0f0f0f0f0f0f0f', captured_at: '2026-10-05T06:00:00Z' });
    const rules = rulesChecks(
      input({
        code: 'Г-01',
        works: RING_WORKS,
        materials: [{ material_id: 21, qty: 2 }],
        photos: [other, afterPhoto({ dhash: '0f0f0f0f0f0f0f0e' })],
        work: 80,
        extra: { orderNumber: (id) => (id === 7 ? 147 : undefined) },
      }),
    );
    expect(rules[1]).toMatchObject({ status: 'fail', points: 0, message_ru: 'фото совпадает с фото наряда №147 от 05.10' });
    expect(aggregateReview(rules, GOOD_LLM).verdict).toBe('rework');
  });

  it('a photo outside the work window or identical to the before photo fails R2', () => {
    const early = rulesChecks(
      input({
        code: 'Г-01',
        works: RING_WORKS,
        materials: [{ material_id: 21, qty: 2 }],
        photos: [afterPhoto({ captured_at: at(-90) })],
        work: 80,
      }),
    );
    expect(early[1]).toMatchObject({ status: 'fail', message_ru: 'фото сделано не во время работ' });

    const before = afterPhoto({ kind: 'before', sha256: 'same', captured_at: at(-85) });
    const copy = rulesChecks(
      input({
        code: 'Г-01',
        works: RING_WORKS,
        materials: [{ material_id: 21, qty: 2 }],
        photos: [before, afterPhoto({ sha256: 'same' })],
        work: 80,
      }),
    );
    expect(copy[1]).toMatchObject({ status: 'fail', message_ru: 'фото после совпадает с фото до' });

    // the same spot shot before and after the repair: similar dHash, 80 minutes apart → legitimate
    const similar = rulesChecks(
      input({
        code: 'Г-01',
        works: RING_WORKS,
        materials: [{ material_id: 21, qty: 2 }],
        photos: [afterPhoto({ kind: 'before', dhash: '0f0f0f0f0f0f0f0c', captured_at: at(-81) }), afterPhoto()],
        work: 80,
      }),
    );
    expect(similar[1]?.status).toBe('pass');
  });

  it('a gallery photo is a warning (G9), rules only review via ai_check_rules', () => {
    const rules = rulesChecks(
      input({
        code: 'Э-03',
        works: 'Заменил пускатель и автомат, проверил пуск',
        materials: [
          { material_id: 29, qty: 1 },
          { material_id: 28, qty: 1 },
        ],
        photos: [afterPhoto({ source: 'gallery' })],
        work: 50,
      }),
    );
    expect(rules[1]).toMatchObject({ status: 'warn', points: 7, message_ru: 'фото после загружено из галереи' });
    const review = aggregateReview(rules, null, { meta: RULES_ONLY_META });
    expect(review.model).toBe('rules');
    expect(review.score).toBe(95); // (20 + 7 + 15 + 20) × 100 / 65 = 95.4
    expect(review.verdict).toBe('accepted');
    expect(review.needs_master_review).toBe(true);
    expect(review.checks[4]).toMatchObject({
      id: 'L1',
      status: 'skipped',
      message_ru: 'не выполнено: проверка только по правилам',
    });
    expect(review.checks[5]).toMatchObject({ id: 'L2', status: 'skipped', message_ru: 'не выполнено' });
  });

  it('a wrong code with untypical materials is accepted with remarks (G6)', () => {
    const rules = rulesChecks(
      input({
        code: 'Э-03',
        works: 'Заменил подшипник насоса и смазал узел',
        materials: [
          { material_id: 2, qty: 1 },
          { material_id: 18, qty: 0.5 },
        ],
        photos: [afterPhoto({ dhash: 'b1b1b1b1b1b1b1b1' })],
        work: 80,
      }),
    );
    expect(rules[2]).toMatchObject({
      status: 'warn',
      points: 9,
      message_ru: 'материал не типовой для шифра Э-03: подшипник 3626; материал не типовой для шифра Э-03: смазка литол-24',
    });
    expect(rules[3]).toMatchObject({ status: 'warn', points: 15, message_ru: 'время 1 ч 20 мин при нормативе 1 ч' });
    const review = aggregateReview(rules, {
      work_match: { verdict: 'partial', explanation: 'ремонт механический' },
      code_consistent: false,
      suggested_code: 'М-02',
      materials_logic: { verdict: 'ok', explanation: '' },
      photo: { after_present: true, same_equipment: 'yes', problem_resolved: 'yes', quality_issues: [], score_1_5: 5, explanation: '' },
      confidence: 0.8,
      feedback_worker: { good: [], improve: ['Укажите верный шифр'] },
      summary_master: 'Шифр не соответствует работам',
    });
    expect(review.checks[4]).toMatchObject({
      id: 'L1',
      status: 'warn',
      points: 2,
      message_ru: 'ремонт механический; шифр не соответствует работам, предложен М-02',
    });
    expect(review.score).toBe(71);
    expect(review.verdict).toBe('accepted_with_remarks');
  });

  it('an unclear photo with low confidence asks the master (G7)', () => {
    const rules = rulesChecks(
      input({ code: 'Г-01', works: RING_WORKS, materials: [{ material_id: 21, qty: 2 }], photos: [afterPhoto()], work: 80 }),
    );
    const review = aggregateReview(rules, {
      work_match: { verdict: 'full', explanation: '' },
      code_consistent: true,
      materials_logic: { verdict: 'ok', explanation: '' },
      photo: {
        after_present: true,
        same_equipment: 'unsure',
        problem_resolved: 'no',
        quality_issues: ['размыто'],
        score_1_5: 1,
        explanation: 'фото размыто',
      },
      confidence: 0.35,
      feedback_worker: { good: [], improve: ['Сделайте чёткое фото'] },
      summary_master: 'Фото неразборчиво',
    });
    expect(review.verdict).toBe('rework');
    expect(review.needs_master_review).toBe(true);
    expect(review.checks[5]).toMatchObject({
      status: 'fail',
      points: 3,
      message_ru: 'неисправность на фото после не устранена; фото размыто',
    });
  });

  it('LLM unavailable and rules pass: rules only review for the master (G8)', () => {
    const rules = rulesChecks(
      input({ code: 'Г-01', works: RING_WORKS, materials: [{ material_id: 21, qty: 2 }], photos: [afterPhoto()], work: 80 }),
    );
    const review = aggregateReview(rules, null, { meta: { error: 'превышен бюджет' } });
    expect(review).toMatchObject({ verdict: 'accepted', score: 100, needs_master_review: true, model: 'rules', confidence: null });
    expect(review.checks[4]?.message_ru).toBe('не выполнено: превышен бюджет');
    expect(review.report_master?.summary).toBe('Принято, 100 баллов. Нарушений правил нет. Нужна проверка мастером.');
    expect(review.feedback_worker?.improve).toEqual([]);
    expect(review.feedback_worker?.good).toHaveLength(4);
  });

  it('overdue but good loses 5 points for the deadline (G10)', () => {
    const rules = rulesChecks(
      input({
        code: 'Г-01',
        works: RING_WORKS,
        materials: [{ material_id: 21, qty: 2 }],
        photos: [afterPhoto()],
        work: 80,
        order: { due_at: at(-10) },
      }),
    );
    expect(rules[3]).toMatchObject({ status: 'warn', points: 15, message_ru: 'срок нарушен на 10 мин' });
    const review = aggregateReview(rules, GOOD_LLM);
    expect(review.verdict).toBe('accepted');
    expect(review.score).toBe(95);
  });

  it('a planned order without a photo is accepted with remarks (G11)', () => {
    const rules = rulesChecks(
      input({
        code: 'С-01',
        type: 'planned',
        works: 'Смазал узлы конвейера по карте смазки',
        materials: [{ material_id: 18, qty: 0.8 }],
        work: 30,
      }),
    );
    expect(rules[0]).toMatchObject({ status: 'warn', points: 15, message_ru: 'нет фото после' });
    const review = aggregateReview(rules, {
      work_match: { verdict: 'full', explanation: 'смазка выполнена' },
      code_consistent: true,
      materials_logic: { verdict: 'ok', explanation: '' },
      photo: { after_present: false, same_equipment: 'unsure', problem_resolved: 'not_applicable', quality_issues: [], score_1_5: 0, explanation: 'фото нет' },
      confidence: 0.8,
      feedback_worker: { good: ['Смазка по карте'], improve: ['Прикладывайте фото после'] },
      summary_master: 'Плановая смазка без фото',
    });
    expect(review.checks[5]).toMatchObject({ status: 'warn', points: 0, message_ru: 'фото после нет; фото нет' });
    expect(review.score).toBe(75);
    expect(review.verdict).toBe('accepted_with_remarks');
  });

  it('a suspiciously fast job is accepted with remarks (G12)', () => {
    const rules = rulesChecks(
      input({ code: 'Г-01', works: RING_WORKS, materials: [{ material_id: 21, qty: 2 }], photos: [afterPhoto()], work: 5 }),
    );
    expect(rules[3]).toMatchObject({
      status: 'warn',
      points: 10,
      message_ru: 'подозрительно быстро: 5 мин при нормативе 1 ч 30 мин',
    });
    const review = aggregateReview(rules, {
      work_match: { verdict: 'partial', explanation: 'мало деталей' },
      code_consistent: true,
      materials_logic: { verdict: 'ok', explanation: '' },
      photo: { after_present: true, same_equipment: 'yes', problem_resolved: 'yes', quality_issues: [], score_1_5: 4, explanation: 'течи не видно' },
      confidence: 0.8,
      feedback_worker: { good: [], improve: [] },
      summary_master: 'Подозрительно быстро',
    });
    expect(review.score).toBe(77);
    expect(review.verdict).toBe('accepted_with_remarks');
  });

  it('demo mode compares a short job with the accelerated norm (1 norm hour = 2 minutes)', () => {
    const base: Case = {
      code: 'Г-01',
      works: RING_WORKS,
      materials: [{ material_id: 21, qty: 2 }],
      photos: [afterPhoto()],
      order: { started_at: at(-2.5) },
    };
    const demo = rulesChecks(input({ ...base, order: { ...base.order, is_demo: true } }));
    expect(demo[3]).toMatchObject({ status: 'pass', points: 20, message_ru: 'время 3 мин при нормативе 3 мин' });

    const real = rulesChecks(input(base));
    expect(real[3]).toMatchObject({
      status: 'warn',
      points: 10,
      message_ru: 'подозрительно быстро: 3 мин при нормативе 1 ч 30 мин',
    });

    // 15 minutes or longer: the real norm again
    const long = rulesChecks(input({ ...base, order: { is_demo: true, started_at: at(-20) } }));
    expect(long[3]?.message_ru).toBe('подозрительно быстро: 20 мин при нормативе 1 ч 30 мин');
  });

  it('pauses and the rework gap (paused_total_sec) do not count as work time', () => {
    const rules = rulesChecks(
      input({
        code: 'Г-01',
        works: RING_WORKS,
        materials: [{ material_id: 21, qty: 2 }],
        photos: [afterPhoto()],
        work: 150,
        order: { paused_total_sec: 90 * 60 },
      }),
    );
    expect(rules[3]).toMatchObject({ status: 'pass', message_ru: 'время 1 ч при нормативе 1 ч 30 мин' });
    expect(
      timeVsNorm({ started_at: at(-150), done_at: at(0), paused_total_sec: 5400, norm_hours: null, fault_code: 'Г-01', is_demo: false }, dirs.work_norms),
    ).toEqual({ work_min: 60, norm_min: 90, ratio: 60 / 90 });
  });

  it('R1 counts every missing field and accepts an explicit «без материалов»', () => {
    const empty = rulesChecks(
      input({ code: 'Г-01', works: 'Сделано', materials: [], photos: [afterPhoto()], order: { fault_code: null } }),
    );
    expect(empty[0]).toMatchObject({
      status: 'warn',
      points: 5,
      message_ru: 'описание работ короткое; не указан шифр неисправности; не указаны материалы',
    });
    const none = rulesChecks(
      input({ code: 'Г-01', works: RING_WORKS, materials: [], photos: [afterPhoto()], extra: { no_materials: true } }),
    );
    expect(none[0]?.status).toBe('pass');
  });

  it('R3 uses the history p90 (5 samples or more)', () => {
    const orders = [1, 2, 3, 4, 5].map((id) => ({ id, fault_code: 'Г-01', status: 'closed' as const }));
    const rows = orders.map((o) => ({ order_id: o.id, material_id: 21, qty: 1 }));
    const p90 = materialP90Lookup('Г-01', orders, rows);
    expect(p90(21)).toBe(1);
    expect(p90(17)).toBeNull();
    expect(materialP90Lookup('Г-01', orders.slice(0, 4), rows)(21)).toBeNull();

    const above = rulesChecks(
      input({ code: 'Г-01', works: RING_WORKS, materials: [{ material_id: 21, qty: 2 }], photos: [afterPhoto()], extra: { p90 } }),
    );
    expect(above[2]).toMatchObject({ status: 'warn', points: 12, message_ru: 'расход выше обычного: кольцо уплотнительное 2 шт' });

    const over = rulesChecks(
      input({ code: 'Г-01', works: RING_WORKS, materials: [{ material_id: 21, qty: 3 }], photos: [afterPhoto()], extra: { p90 } }),
    );
    expect(over[2]).toMatchObject({ status: 'fail', points: 0, message_ru: 'перерасход: кольцо уплотнительное 3 шт при норме до 4' });
  });

  it('missing start or end marks', () => {
    const rules = rulesChecks(input({ code: 'Г-01', works: RING_WORKS, materials: [], order: { started_at: null } }));
    expect(rules[3]).toMatchObject({ status: 'warn', points: 10, message_ru: 'нет отметок начала или окончания работ' });
  });
});

describe('aggregateReview', () => {
  it('suspicious materials cost 5 points inside R3', () => {
    const rules = rulesChecks(
      input({ code: 'Г-01', works: RING_WORKS, materials: [{ material_id: 21, qty: 2 }], photos: [afterPhoto()], work: 80 }),
    );
    const review = aggregateReview(rules, {
      ...GOOD_LLM,
      materials_logic: { verdict: 'suspicious', explanation: 'кольцо без масла' },
    });
    expect(review.checks[2]).toMatchObject({ id: 'R3', status: 'warn', points: 10, message_ru: 'ИИ: кольцо без масла' });
    expect(review.score).toBe(95);
  });

  it('builds a full ai_reviews row', () => {
    const rules = rulesChecks(
      input({ code: 'Г-01', works: RING_WORKS, materials: [{ material_id: 21, qty: 2 }], photos: [afterPhoto()], work: 80 }),
    );
    const row = toAiReview(aggregateReview(rules, GOOD_LLM), {
      id: 9,
      order_id: 1,
      attempt: 1,
      created_at: NOW.toISOString(),
    });
    expect(row).toMatchObject({ id: 9, order_id: 1, attempt: 1, verdict: 'accepted', master_verdict: null, master_score: null });
    expect(row.photo).toEqual(GOOD_LLM.photo);
  });

  it('mock judgement reproduces the demo verdicts', () => {
    const goodInput = input({
      code: 'Г-01',
      works: 'Заменил уплотнительное кольцо, долил масло ВМГЗ, протёр насос',
      materials: [
        { material_id: 21, qty: 2 },
        { material_id: 17, qty: 2 },
        { material_id: 39, qty: 1 },
      ],
      photos: [afterPhoto()],
      order: { is_demo: true, started_at: at(-3) },
    });
    const good = aggregateReview(
      rulesChecks(goodInput),
      mockJudgement({ order: { ...goodInput.order, suggested_fault_code: 'Г-01' }, after_photos: 1 }),
    );
    expect(good.verdict).toBe('accepted');
    expect(good.score).toBe(97);
    expect(good.needs_master_review).toBe(false);
    expect(good.report_master?.summary).toBe('Принято, 97 баллов. Нарушений правил нет.');

    const badInput = input({ code: 'М-02', works: 'Заменил подшипники', materials: [{ material_id: 2, qty: 6 }], work: 150 });
    const bad = aggregateReview(
      rulesChecks(badInput),
      mockJudgement({ order: { ...badInput.order, suggested_fault_code: 'М-02' }, after_photos: 0 }),
    );
    expect(bad.verdict).toBe('rework');
    expect(bad.feedback_worker?.improve).toContain('перерасход: подшипник 3626 6 шт при норме до 2');

    const wrongCode = mockJudgement({
      order: { works_done: RING_WORKS, fault_code: 'Э-03', suggested_fault_code: 'Г-01' },
      after_photos: 1,
    });
    expect(wrongCode).toMatchObject({ code_consistent: false, suggested_code: 'Г-01' });
  });
});

describe('Postgres helpers', () => {
  it('round, numbers and durations read like the SQL', () => {
    expect(pgRound(2.5)).toBe(3);
    expect(pgRound(-2.5)).toBe(-3);
    expect(pgRound(1.005, 2)).toBe(1.01);
    expect(pgRound(29.749999999999996, 1)).toBe(29.8);
    expect(score5Of(90)).toBe(5);
    expect(score5Of(50)).toBe(3);
    expect(score5Of(10)).toBe(1);
    expect(ruNumeric(6)).toBe('6');
    expect(ruNumeric(0.5)).toBe('0,5');
    expect(ruNumeric(0.1 + 0.2)).toBe('0,3');
    expect(ruDuration(90)).toBe('1 ч 30 мин');
    expect(ruDuration(120)).toBe('2 ч');
    expect(ruDuration(0.2)).toBe('1 мин');
    expect(ruDuration(59.6)).toBe('1 ч');
    expect(ruDuration(null)).toBe('?');
  });

  it('dHash distance and percentile_cont', () => {
    expect(dhashDistance('0f0f0f0f0f0f0f0f', '0f0f0f0f0f0f0f0e')).toBe(1);
    expect(dhashDistance('ffffffffffffffff', '0000000000000000')).toBe(64);
    expect(dhashDistance('0f0f', '0f0f')).toBeNull();
    expect(dhashDistance(null, '0f0f0f0f0f0f0f0f')).toBeNull();
    expect(percentileCont([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
    expect(percentileCont([], 0.9)).toBeNull();
  });
});

// The ai-verify golden set (supabase/functions/ai-verify/golden, CLAUDE.md §11): the case files stay consistent
// with the scoring. Each reference answer must reach the expected outcome through rulesChecks + aggregateReview
// (the mirrors of internal.rules_checks and public.ai_submit), and the rule messages match the SQL cases.
// `npm run golden -- --live` measures the real model on the same cases.

import Ajv from 'ajv';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifySchema } from '../../../../supabase/functions/_shared/schemas.ts';
import { buildVerifyMessages } from '../../../../supabase/functions/_shared/verifyInput.ts';
import { normalizeVerifyAnswer } from '../../../../supabase/functions/ai-verify/input.ts';
import {
  goldenContext,
  goldenMatches,
  goldenOutcome,
  goldenPhotos,
  goldenRules,
  type GoldenCase,
} from '../../../../tools/lib/golden.ts';
import { fixtureDirectories } from '../fixtures';

const dir = resolve(import.meta.dirname, '../../../../supabase/functions/ai-verify/golden');
const cases: GoldenCase[] = readdirSync(dir)
  .filter((f) => /^\d\d_.+\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as GoldenCase);
const dirs = fixtureDirectories();
const byId = (id: string): GoldenCase => {
  const c = cases.find((x) => x.case.startsWith(id));
  if (!c) throw new Error(`no golden case ${id}`);
  return c;
};
const rule = (id: string, ruleId: string) =>
  goldenRules(byId(id), dirs).find((r) => r.id === ruleId);

describe('ai-verify golden set', () => {
  it('has the 10 cases of CLAUDE.md §11', () => {
    expect(cases.map((c) => c.spec)).toEqual([
      'good repair → accepted',
      'no after photo → rework',
      'duplicate photo → rework',
      'excess materials → rework',
      'wrong fault code → accepted_with_remarks',
      'unrelated works text → rework',
      'suspiciously fast → accepted_with_remarks',
      'overdue but good → accepted',
      'planned order without photo → accepted_with_remarks',
      'unclear photo → needs master review',
    ]);
  });

  it.each(cases.map((c) => [c.case, c] as const))(
    '%s: the reference answer reaches the expectation',
    (_, c) => {
      const got = goldenOutcome(
        goldenRules(c, dirs),
        c.reference_llm,
        dirs.settings.ai_confidence_threshold,
      );
      expect(
        goldenMatches(c.expected, got),
        JSON.stringify({ expected: c.expected, got: got.verdict, nmr: got.needs_master_review }),
      ).toBe(true);
    },
  );

  it('reference answers pass the ai-verify answer cleanup unchanged', () => {
    for (const c of cases) {
      const order = { fault_code: c.order.fault_code };
      expect(normalizeVerifyAnswer(structuredClone(c.reference_llm), order), c.case).toEqual(
        c.reference_llm,
      );
    }
  });

  it('reference answers are valid structured outputs', () => {
    const validate = new Ajv({ strict: false }).compile(verifySchema);
    for (const c of cases)
      expect(validate(c.reference_llm), `${c.case}: ${JSON.stringify(validate.errors)}`).toBe(true);
  });

  it('rules give the reasons of the SQL cases', () => {
    expect(rule('02', 'R1')).toMatchObject({
      status: 'fail',
      message_ru: expect.stringMatching(/^нет фото после: обязательно для внеплановых работ/),
    });
    expect(rule('03', 'R2')).toMatchObject({
      status: 'fail',
      message_ru: 'фото совпадает с фото наряда №9001 от 07.10',
    });
    expect(rule('04', 'R3')).toMatchObject({
      status: 'fail',
      message_ru: 'перерасход: подшипник 3626 6 шт при норме до 2',
    });
    expect(rule('05', 'R3')).toMatchObject({ status: 'warn', points: 9 });
    expect(rule('05', 'R4')).toMatchObject({
      status: 'warn',
      points: 10,
      message_ru: 'время 1 ч 40 мин при нормативе 1 ч',
    });
    expect(rule('07', 'R4')).toMatchObject({
      status: 'warn',
      points: 10,
      message_ru: expect.stringMatching(/^подозрительно быстро: 5 мин/),
    });
    expect(rule('08', 'R4')).toMatchObject({
      status: 'warn',
      points: 15,
      message_ru: 'срок нарушен на 35 мин',
    });
    expect(rule('09', 'R1')).toMatchObject({ status: 'warn', points: 15 });
    // the good cases pass every rule
    for (const id of ['01', '06', '10']) {
      expect(
        goldenRules(byId(id), dirs).every((r) => r.status === 'pass'),
        id,
      ).toBe(true);
    }
  });

  it('builds the ai-verify input with small photos, before first', () => {
    for (const c of cases) {
      const ctx = goldenContext(c, dirs, goldenRules(c, dirs));
      const photos = goldenPhotos(ctx, (file) => readFileSync(resolve(dir, file)));
      expect(photos.map((p) => p.kind)).toEqual(
        (['before', 'after'] as const).filter((k) => c.photos.some((p) => p.kind === k)),
      );
      for (const p of c.photos) expect(statSync(resolve(dir, p.file)).size).toBeLessThan(100_000);
      const { messages } = buildVerifyMessages(ctx, photos);
      const content = messages[0]?.content;
      expect(Array.isArray(content) && content.filter((part) => part.type === 'image').length).toBe(
        photos.length,
      );
    }
  });
});

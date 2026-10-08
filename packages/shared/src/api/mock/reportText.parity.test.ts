// The rules texts of the report functions (supabase/functions/_shared/reportText.ts) and of MockApi and the
// SupabaseApi fallback (mock/ai.ts) must read the same: whichever side falls back, the master sees one text.

import { describe, expect, it } from 'vitest';
import { REPORT } from '../../../../../supabase/functions/_shared/reportFixtures.ts';
import {
  templateExplainRating,
  templateShiftSummary,
  type ShiftReportData,
} from '../../../../../supabase/functions/_shared/reportText.ts';
import type { RatingRow, ShiftReport } from '../../domain/types';
import { mockExplainRating, mockShiftSummary } from './ai';

const variants: [string, ShiftReportData][] = [
  ['a busy shift', REPORT],
  [
    'a quiet shift',
    {
      ...REPORT,
      counts: { ...REPORT.counts, overdue: 0, rejected: 0, rework: 0 },
      rejected_reasons: [],
      workload: [],
      downtime: [],
      downtime_hours: 0,
      reaction_avg_min: null,
      execution_avg_min: 42,
      verdicts: {},
      top_issues: [{ code: 'С-01', name: null, count: 1 }],
    },
  ],
  [
    'a reject without reason',
    {
      ...REPORT,
      rejected_reasons: [{ reason: null, count: 2 }],
      verdicts: { rework: 3 },
      reaction_avg_min: 12.25,
      execution_avg_min: null,
    },
  ],
];

describe('rules texts parity', () => {
  it.each(variants)('shift summary: %s', (_, report) => {
    expect(templateShiftSummary(report)).toEqual(mockShiftSummary(report as unknown as ShiftReport));
  });

  it('rating explanation', () => {
    const row: RatingRow = {
      kind: 'worker',
      id: 'x',
      name: 'Сериков Д.',
      brigade_id: 2,
      closed: 14,
      q: 0.78,
      t: 0.86,
      f: 0.52,
      v: 0.71,
      d: 0.95,
      score: 74.2,
      rank: 13,
      note: null,
    };
    expect(templateExplainRating(row)).toBe(mockExplainRating(row));
    for (const k of ['q', 't', 'f', 'v', 'd'] as const) {
      const low = { ...row, [k]: 0.1 };
      expect(templateExplainRating(low)).toBe(mockExplainRating(low));
    }
    const none = { ...row, score: null, closed: 0 };
    expect(templateExplainRating(none)).toBe(mockExplainRating(none));
    expect(templateExplainRating(undefined)).toBe(mockExplainRating(undefined));
  });
});

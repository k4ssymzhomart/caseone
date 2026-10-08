// A shift report as public.shift_report returns it, for the tests of the report functions and the parity test of
// the rules texts. Synthetic people of CLAUDE.md §19 only.

import type { ShiftReportData } from './reportText.ts';

export const IVANOV = '00000000-0000-4000-8000-000000002002';
export const AKHMETOV = '00000000-0000-4000-8000-000000002001';

export const REPORT: ShiftReportData = {
  period: { from: '2026-10-09T03:00:00.000Z', to: '2026-10-09T15:00:00.000Z' },
  counts: {
    issued: 7,
    accepted: 6,
    done: 5,
    closed: 12,
    overdue: 1,
    rejected: 2,
    rework: 1,
    cancelled: 0,
    active_now: 9,
  },
  rejected_reasons: [
    { reason: 'no_permit', count: 1 },
    { reason: 'other', count: 1 },
  ],
  workload: [
    { employee_id: IVANOV, short_name: 'Иванов С.', busy_min: 150, share: 0.42 },
    { employee_id: AKHMETOV, short_name: 'Ахметов Е.', busy_min: 65, share: 0.18 },
  ],
  downtime: [{ equipment_id: 20, name: 'Насос НШ-32 маслостанции', hours: 2.1, orders: 1 }],
  downtime_hours: 2.1,
  reaction_avg_min: 4.2,
  execution_avg_min: 95,
  on_time_share: 0.917,
  verdicts: { accepted: 8, accepted_with_remarks: 2, rework: 1 },
  master_overrides: 1,
  top_issues: [{ code: 'М-02', name: 'Подшипник: перегрев, шум, разрушение', count: 2 }],
  top_equipment: [{ equipment_id: 12, name: 'Конвейер К-2', count: 2 }],
};


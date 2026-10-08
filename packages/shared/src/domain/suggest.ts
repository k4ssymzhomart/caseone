// AI executor suggestion (CLAUDE.md §10), mirrored from public.suggest_assignees() in
// supabase/migrations/20261008100005_rota_views.sql. Mock only: SupabaseApi calls the RPC. Also the client side
// derivation of the required specialty from the problem description.
// score = 0.40·availability + 0.30·skill_on_type + 0.15·grade + 0.10·same_area_today + 0.05·(1 − load_today);
// a specialty mismatch multiplies it by 0.3.

import type { Specialty, WorkerState } from './enums';
import type { AssigneeSuggestion, Directories, Order, WorkerStatusView } from './types';
import { ORDER_FORMS, plural } from '../format/number';
import { pgRound } from './verifyRules';

// ---------------------------------------------------------------------------
// required specialty
// ---------------------------------------------------------------------------

/** Description keyword stems per specialty (CLAUDE.md §10, lower case, ё read as е), most specific first. */
export const SPECIALTY_KEYWORDS: readonly { specialty: Specialty; pattern: RegExp }[] = [
  { specialty: 'смазчик', pattern: /смаз/ },
  { specialty: 'сварщик', pattern: /свар|трещин|излом|разрыв металл/ },
  { specialty: 'электромонтёр', pattern: /электр|кабел|двигател|автомат|пускат|датчик|щит|освещ|искр/ },
  { specialty: 'слесарь', pattern: /течь|масл|гидрав|подшип|лент|редукт|вибрац|шум/ },
];

/**
 * The specialty a problem description calls for, or null when no keyword matches. The specialty with the most
 * keyword hits wins; a tie goes to the more specific one (смазчик, сварщик, электромонтёр, слесарь).
 * «Течь масла» → слесарь, «Искрит кабель» → электромонтёр, «Трещина рамы» → сварщик, «Недостаток смазки» → смазчик.
 */
export function specialtyFromText(description: string | null | undefined): Specialty | null {
  const text = (description ?? '').toLowerCase().replace(/ё/g, 'е');
  if (text.trim() === '') return null;
  let best: Specialty | null = null;
  let bestHits = 0;
  for (const { specialty, pattern } of SPECIALTY_KEYWORDS) {
    const hits = text.match(new RegExp(pattern.source, 'g'))?.length ?? 0;
    if (hits > bestHits) {
      best = specialty;
      bestHits = hits;
    }
  }
  return best;
}

export interface RequiredSpecialtyInput {
  description?: string | null;
  equipment_id?: number | null;
  suggested_fault_code?: string | null;
}

/**
 * The required specialty for suggestAssignees, in the order of CLAUDE.md §10: description keywords, then the
 * equipment type default (equipment_type_specialty), then the suggested fault code's specialty. Pass the result
 * as `specialty` to api.orders.suggestAssignees (the RPC itself falls back to the equipment type).
 */
export function requiredSpecialty(
  input: RequiredSpecialtyInput,
  directories: Pick<Directories, 'equipment' | 'equipment_type_specialty' | 'fault_codes'>,
): string | null {
  const fromText = specialtyFromText(input.description);
  if (fromText) return fromText;
  const eq = input.equipment_id == null ? undefined : directories.equipment.find((e) => e.id === input.equipment_id);
  const byType = eq ? directories.equipment_type_specialty.find((s) => s.type === eq.type)?.specialty : undefined;
  if (byType) return byType;
  const code = input.suggested_fault_code;
  return (code ? directories.fault_codes.find((f) => f.code === code)?.specialty : undefined) ?? null;
}

// ---------------------------------------------------------------------------
// suggest_assignees
// ---------------------------------------------------------------------------

/** Order fields the suggestion reads (closed orders for skill, the last 12 hours for area and load). */
export type SuggestOrder = Pick<
  Order,
  'assignee_id' | 'status' | 'equipment_id' | 'area_id' | 'final_score' | 'norm_hours' | 'created_at'
>;

export interface SuggestInput {
  equipment_id: number;
  /** p_required_specialty; null falls back to the equipment type default. */
  required_specialty?: string | null;
  /** p_exclude: the current assignee for an escalation. */
  exclude?: string | null;
  directories: Pick<Directories, 'equipment' | 'equipment_type_specialty'>;
  /** v_worker_status rows (deriveWorkerStatuses). */
  workers: readonly WorkerStatusView[];
  orders: readonly SuggestOrder[];
  /** The server clock (default new Date()). */
  now?: Date;
  /** Default 3. */
  limit?: number;
}

/** Postgres initcap: first letter of each word upper case, the rest lower case. */
export function initcap(text: string): string {
  return text.toLowerCase().replace(/(^|[^0-9A-Za-zА-Яа-яЁё])([0-9A-Za-zА-Яа-яЁё])/g, (_, sep: string, ch: string) =>
    sep + ch.toUpperCase(),
  );
}

/** availability: free 1.0; queue max(0.2, 0.6 − 0.1·queue_count); working 0.25; off 0. */
export function availability(status: WorkerState, queueCount: number): number {
  switch (status) {
    case 'free':
      return 1;
    case 'queue':
      return Math.max(0.2, 0.6 - 0.1 * queueCount);
    case 'working':
      return 0.25;
    default:
      return 0;
  }
}

const TEAM_DEFAULT_SCORE = 80;
const PRIOR = 5;
const DAY_WINDOW_MS = 12 * 3_600_000;

/** public.suggest_assignees: the top candidates on shift with their score and reasons. */
export function suggestAssignees(input: SuggestInput): AssigneeSuggestion[] {
  const { directories } = input;
  const now = (input.now ?? new Date()).getTime();
  const eq = directories.equipment.find((e) => e.id === input.equipment_id);
  const typeRow = eq ? directories.equipment_type_specialty.find((s) => s.type === eq.type) : undefined;
  const spec = input.required_specialty ?? typeRow?.specialty ?? null;
  const typeDat = typeRow?.label_plural_dat ?? null;

  const typeOf = new Map(directories.equipment.map((e) => [e.id, e.type]));
  const closedOnType = input.orders.filter(
    (o) => o.status === 'closed' && o.final_score != null && eq != null && typeOf.get(o.equipment_id) === eq.type,
  );
  const teamMean =
    closedOnType.length > 0
      ? closedOnType.reduce((sum, o) => sum + (o.final_score ?? 0), 0) / closedOnType.length
      : TEAM_DEFAULT_SCORE;
  const recent = input.orders.filter((o) => Date.parse(o.created_at) >= now - DAY_WINDOW_MS);

  const candidates = input.workers.filter((w) => w.on_shift && (input.exclude == null || w.id !== input.exclude));
  const scored = candidates.map((c) => {
    const hist = closedOnType.filter((o) => o.assignee_id === c.id);
    const n = hist.length;
    const histMean = n > 0 ? hist.reduce((sum, o) => sum + (o.final_score ?? 0), 0) / n : null;
    const today = recent.filter((o) => o.assignee_id === c.id);
    const sameArea = eq != null && today.some((o) => o.area_id === eq.area_id);
    return {
      c,
      n,
      histMean,
      availability: availability(c.status, c.queue_count),
      skill: ((n * (histMean ?? teamMean) + PRIOR * teamMean) / (n + PRIOR)) / 100,
      grade: (c.grade ?? 3) / 6,
      sameArea: sameArea ? 1 : 0,
      load: today.reduce((sum, o) => sum + (o.norm_hours ?? 1), 0),
    };
  });
  const maxLoad = scored.reduce((m, s) => Math.max(m, s.load), 0);

  const final = scored.map((s) => {
    const loadNorm = maxLoad > 0 ? s.load / maxLoad : 0;
    const match = spec == null || s.c.specialty === spec ? 1 : 0.3;
    const total =
      (0.4 * s.availability + 0.3 * s.skill + 0.15 * s.grade + 0.1 * s.sameArea + 0.05 * (1 - loadNorm)) * match;
    const reasons: (string | null)[] = [
      s.c.status === 'free'
        ? 'Свободен'
        : s.c.status === 'queue'
          ? `В очереди ${s.c.queue_count}`
          : s.c.status === 'working' && s.c.current_order_number != null
            ? `Выполняет наряд №${s.c.current_order_number}`
            : null,
      s.c.specialty != null && s.c.grade != null ? `${initcap(s.c.specialty)} ${s.c.grade} разряда` : null,
      s.n > 0 && s.histMean != null
        ? `${s.n} ${plural(s.n, ORDER_FORMS)} по ${typeDat ?? 'этому типу'}, средняя оценка ` +
          pgRound(s.histMean / 20, 1).toFixed(1).replace('.', ',')
        : null,
      s.sameArea === 1 ? 'Сегодня работал на этом участке' : null,
      spec != null && s.c.specialty !== spec ? 'Другая специальность' : null,
    ];
    return {
      total,
      row: {
        employee_id: s.c.id,
        short_name: s.c.short_name,
        status: s.c.status,
        score: pgRound(total, 3),
        reasons: reasons.filter((r): r is string => r != null),
      } satisfies AssigneeSuggestion,
    };
  });

  return final
    .sort((a, b) =>
      b.total !== a.total
        ? b.total - a.total
        : a.row.short_name < b.row.short_name
          ? -1
          : a.row.short_name > b.row.short_name
            ? 1
            : 0,
    )
    .slice(0, input.limit ?? 3)
    .map((x) => x.row);
}

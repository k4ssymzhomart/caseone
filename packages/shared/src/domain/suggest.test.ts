import { describe, expect, it } from 'vitest';
import { employees, fixtureDirectories, mockEmployeeId } from '../fixtures';
import type { WorkerStatusView } from './types';
import type { WorkerState } from './enums';
import {
  availability,
  initcap,
  requiredSpecialty,
  specialtyFromText,
  suggestAssignees,
  type SuggestInput,
  type SuggestOrder,
} from './suggest';

const NOW = new Date('2026-10-08T05:00:00Z'); // 10:00 local, day shift
const dirs = fixtureDirectories();
const PUMP_NSH = 20; // Насос НШ-32 маслостанции, участок обогащения (3), type насос
const id = mockEmployeeId;

/** The Demo Day start state of CLAUDE.md §20 as v_worker_status rows. */
function demoWorkers(): WorkerStatusView[] {
  const state: Record<string, { status: WorkerState; queue?: number; current?: number }> = {
    '2001': { status: 'free' },
    '2009': { status: 'free' },
    '2005': { status: 'free' },
    '2002': { status: 'working', current: 147 },
    '2003': { status: 'working', current: 148 },
    '2007': { status: 'working', current: 149 },
    '2006': { status: 'queue', queue: 2 },
    '2008': { status: 'queue', queue: 1 },
    '2010': { status: 'queue', queue: 1 },
  };
  return employees
    .filter((e) => e.role === 'worker')
    .map((e) => {
      const s = state[e.tab_no];
      return {
        id: e.id,
        tab_no: e.tab_no,
        short_name: e.short_name,
        specialty: e.specialty,
        grade: e.grade,
        brigade_id: e.brigade_id,
        shift: e.shift,
        on_shift: s != null,
        current_order_id: s?.current ?? null,
        current_order_number: s?.current ?? null,
        current_equipment_name: null,
        queue_count: s?.queue ?? 0,
        status: s?.status ?? 'off',
      };
    });
}

function input(over: Partial<SuggestInput> = {}): SuggestInput {
  return {
    equipment_id: PUMP_NSH,
    required_specialty: specialtyFromText('Течь масла'),
    directories: dirs,
    workers: demoWorkers(),
    orders: [],
    now: NOW,
    ...over,
  };
}

function closedOn(equipmentId: number, assignee: string, score: number): SuggestOrder {
  return {
    assignee_id: assignee,
    status: 'closed',
    equipment_id: equipmentId,
    area_id: dirs.equipment.find((e) => e.id === equipmentId)?.area_id ?? 1,
    final_score: score,
    norm_hours: 1.5,
    created_at: '2026-09-20T05:00:00Z',
  };
}

describe('specialtyFromText', () => {
  it('maps the keywords of CLAUDE.md §10', () => {
    expect(specialtyFromText('Течь масла')).toBe('слесарь');
    expect(specialtyFromText('Шум подшипника')).toBe('слесарь');
    expect(specialtyFromText('Сход ленты')).toBe('слесарь');
    expect(specialtyFromText('Искрит кабель у щита')).toBe('электромонтёр');
    expect(specialtyFromText('Не работает датчик')).toBe('электромонтёр');
    expect(specialtyFromText('Трещина рамы')).toBe('сварщик');
    expect(specialtyFromText('Нужна сварка кронштейна')).toBe('сварщик');
    expect(specialtyFromText('Недостаток смазки')).toBe('смазчик');
    expect(specialtyFromText('Не запускается')).toBeNull();
    expect(specialtyFromText('')).toBeNull();
    expect(specialtyFromText(null)).toBeNull();
  });

  it('the specialty with more hits wins, a tie goes to the more specific one', () => {
    expect(specialtyFromText('Шум и вибрация двигателя')).toBe('слесарь');
    expect(specialtyFromText('Перегрев электродвигателя')).toBe('электромонтёр');
    expect(specialtyFromText('Мало смазки, масло грязное')).toBe('смазчик');
  });

  it('requiredSpecialty: keywords, then the equipment type, then the fault code', () => {
    expect(requiredSpecialty({ description: 'Искрит кабель', equipment_id: PUMP_NSH }, dirs)).toBe('электромонтёр');
    expect(requiredSpecialty({ description: 'Не запускается', equipment_id: PUMP_NSH }, dirs)).toBe('слесарь');
    expect(requiredSpecialty({ description: 'Не запускается', suggested_fault_code: 'Э-01' }, dirs)).toBe('электромонтёр');
    expect(requiredSpecialty({}, dirs)).toBeNull();
  });
});

describe('suggestAssignees', () => {
  it('demo step 2: Ахметов is the only free слесарь and comes first with his reasons', () => {
    const top = suggestAssignees(input());
    expect(top).toHaveLength(3);
    expect(top[0]).toEqual({
      employee_id: id('2001'),
      short_name: 'Ахметов Е.',
      status: 'free',
      // 0.40·1 + 0.30·0.8 + 0.15·5/6 + 0.10·0 + 0.05·1
      score: 0.815,
      reasons: ['Свободен', 'Слесарь 5 разряда'],
    });
    // queued слесари follow: Абенов (1 in queue) then Сериков (2 in queue)
    expect(top.map((s) => s.short_name)).toEqual(['Ахметов Е.', 'Абенов Т.', 'Сериков Д.']);
    expect(top[1]).toMatchObject({ status: 'queue', score: 0.565, reasons: ['В очереди 1', 'Слесарь 3 разряда'] });
  });

  it('never suggests workers off shift or the excluded one', () => {
    const all = suggestAssignees(input({ limit: 20 }));
    expect(all).toHaveLength(9);
    expect(all.some((s) => s.short_name === 'Литвиненко О.')).toBe(false);
    const escalation = suggestAssignees(input({ exclude: id('2001') }));
    expect(escalation[0]?.short_name).toBe('Абенов Т.');
  });

  it('a specialty mismatch costs 70% and says so', () => {
    const all = suggestAssignees(input({ limit: 20 }));
    const kim = all.find((s) => s.short_name === 'Ким Д.');
    expect(kim).toMatchObject({ status: 'free', reasons: ['Свободен', 'Электромонтёр 5 разряда', 'Другая специальность'] });
    // 0.815 × 0.3 = 0.2445: on this exact half the third decimal may differ from numeric by 0.001
    expect([0.244, 0.245]).toContain(kim?.score);
    const working = all.find((s) => s.employee_id === id('2002'));
    expect(working?.reasons[0]).toBe('Выполняет наряд №147');
  });

  it('history on the equipment type and work on the same area today add reasons', () => {
    const orders: SuggestOrder[] = [
      closedOn(4, id('2001'), 94),
      closedOn(5, id('2001'), 94),
      closedOn(1, id('2006'), 60), // an excavator: another type, ignored
      {
        assignee_id: id('2007'),
        status: 'in_progress',
        equipment_id: 21,
        area_id: 3,
        final_score: null,
        norm_hours: 2,
        created_at: '2026-10-08T03:00:00Z',
      },
    ];
    const all = suggestAssignees(input({ orders, limit: 20 }));
    const ahmetov = all.find((s) => s.employee_id === id('2001'));
    expect(ahmetov?.reasons).toEqual(['Свободен', 'Слесарь 5 разряда', '2 наряда по насосам, средняя оценка 4,7']);
    // skill (2·94 + 5·94) / 7 / 100 = 0.94; nobody else has load, so load_norm 0 for him
    expect(ahmetov?.score).toBe(0.857);
    const petrenko = all.find((s) => s.employee_id === id('2007'));
    expect(petrenko?.reasons).toEqual(['Выполняет наряд №149', 'Слесарь 6 разряда', 'Сегодня работал на этом участке']);
    // 0.40·0.25 + 0.30·0.94 + 0.15·1 + 0.10·1 + 0.05·0 (the most load)
    expect(petrenko?.score).toBe(0.632);
  });

  it('falls back to the equipment type default specialty', () => {
    const top = suggestAssignees(input({ required_specialty: null }));
    expect(top[0]?.short_name).toBe('Ахметов Е.');
  });

  it('helpers', () => {
    expect(availability('queue', 2)).toBeCloseTo(0.4);
    expect(availability('queue', 9)).toBe(0.2);
    expect(availability('working', 0)).toBe(0.25);
    expect(availability('off', 0)).toBe(0);
    expect(initcap('электромонтёр')).toBe('Электромонтёр');
    expect(initcap('буровой станок')).toBe('Буровой Станок');
  });
});

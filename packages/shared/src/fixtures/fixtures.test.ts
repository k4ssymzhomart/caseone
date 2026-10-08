// Parity: the fixtures must equal the database export (PHASE_1 §7.1). Regenerate with npx tsx tools/gen-fixtures.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PINS,
  areas,
  brigades,
  employees,
  equipment,
  equipmentTypeSpecialty,
  faultCodes,
  fixtureDirectories,
  materials,
  mockEmployeeId,
  problemTemplates,
  settings,
  workNorms,
} from './index';

type Row = Record<string, unknown>;
const json = JSON.parse(
  readFileSync(new URL('../../../../supabase/seed/directories.json', import.meta.url), 'utf8'),
) as Record<string, Row[]> & { settings: Row };

const sortById = (rows: Row[]): Row[] => [...rows].sort((a, b) => Number(a.id) - Number(b.id));
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe('fixtures match supabase/seed/directories.json', () => {
  it('has the counts of CLAUDE.md §19', () => {
    expect(areas).toHaveLength(4);
    expect(equipment).toHaveLength(25);
    expect(brigades).toHaveLength(3);
    expect(employees).toHaveLength(19);
    expect(faultCodes).toHaveLength(20);
    expect(materials).toHaveLength(40);
    expect(workNorms).toHaveLength(20);
    expect(problemTemplates).toHaveLength(58);
    expect(equipmentTypeSpecialty).toHaveLength(json.equipment_type_specialty!.length);
  });

  it('ids run 1..n in order', () => {
    expect(areas.map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect(equipment.map((r) => r.id)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(materials.map((r) => r.id)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(brigades.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(problemTemplates.map((r) => r.id)).toEqual(Array.from({ length: 58 }, (_, i) => i + 1));
  });

  it('areas, materials, fault codes, problem templates and type specialties are identical', () => {
    expect(plain(areas)).toEqual(sortById(json.areas!));
    expect(plain(materials)).toEqual(sortById(json.materials!));
    expect(plain(faultCodes)).toEqual(json.fault_codes);
    expect(plain(problemTemplates)).toEqual(sortById(json.problem_templates!));
    expect(plain(equipmentTypeSpecialty)).toEqual(json.equipment_type_specialty);
  });

  it('equipment is identical apart from is_stopped (false at rest)', () => {
    expect(equipment.every((e) => e.is_stopped === false)).toBe(true);
    expect(plain(equipment.map(({ is_stopped: _s, ...rest }) => rest))).toEqual(
      sortById(json.equipment!),
    );
  });

  it('work norms are identical, typical materials included', () => {
    expect(plain(workNorms)).toEqual(json.work_norms);
    const c01 = workNorms.find((n) => n.fault_code === 'С-01');
    expect(c01?.typical).toEqual([{ material_id: 18, qty: 0.8, qty_max: 2 }]);
  });

  it('employees match by tab number with deterministic mock ids', () => {
    expect(employees.map((e) => e.tab_no)).toEqual(json.employees!.map((e) => e.tab_no));
    for (const e of employees) {
      const src = json.employees!.find((r) => r.tab_no === e.tab_no)!;
      const { id, on_shift, telegram_chat_id, created_at, ...rest } = e;
      expect(id).toBe(mockEmployeeId(e.tab_no));
      expect(on_shift).toBe(false);
      expect(telegram_chat_id).toBeNull();
      expect(typeof created_at).toBe('string');
      expect(plain(rest)).toEqual(src);
    }
  });

  it('brigade leaders resolve by tab number', () => {
    for (const b of brigades) {
      const src = json.brigades!.find((r) => r.id === b.id)!;
      expect(b.name).toBe(src.name);
      expect(b.leader_id).toBe(mockEmployeeId(String(src.leader_tab_no)));
      expect(employees.some((e) => e.id === b.leader_id && e.brigade_id === b.id)).toBe(true);
    }
  });

  it('settings are identical', () => {
    expect(plain(settings)).toEqual(json.settings);
  });

  it('every employee has a PIN of CLAUDE.md §19', () => {
    expect(PINS['1001']).toBe('1111');
    expect(PINS['1002']).toBe('2222');
    expect(PINS['3001']).toBe('3333');
    expect(PINS['9001']).toBe('9999');
    for (const e of employees.filter((x) => x.role === 'worker'))
      expect(PINS[e.tab_no]).toBe('1234');
    expect(Object.keys(PINS).sort()).toEqual(employees.map((e) => e.tab_no).sort());
  });

  it('fixtureDirectories returns independent copies', () => {
    const a = fixtureDirectories();
    a.equipment[0]!.is_stopped = true;
    expect(fixtureDirectories().equipment[0]!.is_stopped).toBe(false);
    expect(equipment[0]!.is_stopped).toBe(false);
  });
});

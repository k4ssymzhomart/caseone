// Deterministic mock ids. The database uses auth user ids, so these exist only in MockApi and tests.
// tools/gen-fixtures.ts uses the same formula.

/** 2001 → 00000000-0000-4000-8000-000000002001 */
export function mockEmployeeId(tabNo: string): string {
  return `00000000-0000-4000-8000-${tabNo.padStart(12, '0')}`;
}

/** Mock sign in uses the real account format, so the two modes read the same. */
export function accountEmail(tabNo: string): string {
  return `${tabNo}@naryad.local`;
}

export function accountPassword(pin: string): string {
  return `nr_${pin}_kz`;
}

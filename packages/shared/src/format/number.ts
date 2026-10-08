// Number formatting: Russian plurals and the decimal comma.

/** Russian plural forms: [one, few, many], e.g. ['балл', 'балла', 'баллов']. Same rule as SQL internal.plural. */
export type PluralForms = readonly [one: string, few: string, many: string];

export function plural(n: number, forms: PluralForms): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

export const SCORE_FORMS: PluralForms = ['балл', 'балла', 'баллов'];
export const INSIGHT_FORMS: PluralForms = ['вывод', 'вывода', 'выводов'];
export const ORDER_FORMS: PluralForms = ['наряд', 'наряда', 'нарядов'];

/** «81 балл», «82 балла», «85 баллов». */
export function formatScore(score: number): string {
  const n = Math.round(score);
  return `${n} ${plural(n, SCORE_FORMS)}`;
}

/** «n word» with agreement: formatCount(3, ORDER_FORMS) → «3 наряда». */
export function formatCount(n: number, forms: PluralForms): string {
  return `${n} ${plural(n, forms)}`;
}

/** Decimal comma, up to `digits` fraction digits, no trailing zeros: 4.7 → «4,7», 2 → «2». */
export function formatNumber(value: number, digits = 1): string {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return String(rounded).replace('.', ',');
}

/** 0.42 → «42%». */
export function formatPercent(share: number, digits = 0): string {
  return `${formatNumber(share * 100, digits)}%`;
}

/** 185000 → «185 000» (narrow grouping with a regular space, no Intl). */
export function formatInt(value: number): string {
  const sign = value < 0 ? '−' : '';
  return sign + String(Math.abs(Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** «№147». */
export function formatOrderNo(n: number): string {
  return `№${n}`;
}

/** «85 из 100», «4 из 5». */
export function formatOutOf(value: number, max: number): string {
  return `${Math.round(value)} из ${max}`;
}

/** Material quantity with its unit and the decimal comma: «2 шт», «0,5 кг», «1,25 л». */
export function formatQty(qty: number, unit: string): string {
  return `${formatNumber(qty, 2)} ${unit}`;
}

/**
 * A quantity printed like the SQL internal.ru_num: integers without a fraction, otherwise every
 * significant digit (float noise cut at 6 digits) with the decimal comma: 2 → «2», 0.5 → «0,5», 1.25 → «1,25».
 */
export function ruNum(value: number): string {
  return formatNumber(value, 6);
}

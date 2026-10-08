import { ru, type I18nKey } from './ru';

export { ru };
export type { I18nKey };

export type I18nParams = Readonly<Record<string, string | number | null | undefined>>;

/** Fills {placeholder} slots; a missing or null param leaves the slot empty. */
export function fill(template: string, params?: I18nParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value == null ? '' : String(value);
  });
}

/** t('status.issued') → «Выдан»; t('error.NOT_ON_SHIFT', { name: 'Ахметов Е.' }). Unknown keys return the key. */
export function t(key: I18nKey, params?: I18nParams): string {
  const template: string | undefined = (ru as Record<string, string>)[key];
  return fill(template ?? key, params);
}

/** Runtime check for keys built from data, e.g. `status.${order.status}`. */
export function hasKey(key: string): key is I18nKey {
  return Object.prototype.hasOwnProperty.call(ru, key);
}

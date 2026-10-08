// t() for the web panel: the shared domain dictionary (@rota/shared ru.ts) plus the panel strings (strings.ts).
// Every UI string goes through it: t('nav.shift'), t('status.in_progress'), t('page.order', { number: 147 }).
import { fill, hasKey, ru, type I18nKey, type I18nParams } from '@rota/shared';
import { webRu, type WebKey } from './strings';

export type Key = I18nKey | WebKey;

export function t(key: Key, params?: I18nParams): string {
  const template = (webRu as Record<string, string>)[key] ?? (ru as Record<string, string>)[key];
  return fill(template ?? key, params);
}

/** For keys built from data (`status.${order.status}`): falls back to the raw value when the key is unknown. */
export function tData(key: string, params?: I18nParams): string {
  if (key in webRu) return t(key as WebKey, params);
  if (hasKey(key)) return t(key, params);
  return key;
}

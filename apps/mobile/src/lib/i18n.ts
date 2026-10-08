import { mobileRu } from './strings';

type Params = Record<string, string | number | null | undefined>;

// Dictionaries checked in order. The shared domain dictionary (@rota/shared ru.ts) is registered at
// startup once lane B's package lands, so screens call one `t()` for both.
const dictionaries: Record<string, string>[] = [mobileRu];

export function registerDictionary(dict: Record<string, string>): void {
  if (!dictionaries.includes(dict)) dictionaries.unshift(dict);
}

/** `t('key', { n: 147 })` fills `{n}` placeholders. Unknown keys come back as the key, so gaps are visible. */
export function t(key: string, params?: Params): string {
  let text: string | undefined;
  for (const d of dictionaries) {
    text = d[key];
    if (text !== undefined) break;
  }
  if (text === undefined) return key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = params[k];
    return v === null || v === undefined ? '' : String(v);
  });
}

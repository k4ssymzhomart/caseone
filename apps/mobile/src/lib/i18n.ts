import { ru as sharedRu } from '@rota/shared';

import { mobileRu } from './strings';
import { authRu } from './strings/auth';
import { createRu } from './strings/create';
import { masterRu } from './strings/master';
import { orderRu } from './strings/order';
import { reviewRu } from './strings/review';
import { workerRu } from './strings/worker';

type Params = Record<string, string | number | null | undefined>;

// Dictionaries checked in order: the shared domain dictionary (@rota/shared ru.ts: statuses, reasons,
// errors, templates), then the mobile chrome strings. Screens call one `t()` for both.
const dictionaries: Record<string, string>[] = [
  sharedRu as Record<string, string>,
  mobileRu,
  authRu,
  workerRu,
  orderRu,
  reviewRu,
  masterRu,
  createRu,
];

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

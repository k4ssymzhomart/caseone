// Quick phrases for «Что сделано»: one tap appends a sentence, a second tap takes it out again.

export const WORK_PHRASE_KEYS = [
  'close.phrase.seal',
  'close.phrase.fasteners',
  'close.phrase.bearing',
  'close.phrase.lube',
  'close.phrase.clean',
  'close.phrase.load',
] as const;

/** «Заменил уплотнение.» then «Заменил уплотнение. Подтянул крепёж.» */
export function appendPhrase(text: string, phrase: string): string {
  const base = text.trimEnd();
  if (!base) return `${phrase}.`;
  const sep = /[.!?…]$/.test(base) ? ' ' : '. ';
  return `${base}${sep}${phrase}.`;
}

export function removePhrase(text: string, phrase: string): string {
  const withDot = `${phrase}.`;
  const next = text.includes(withDot) ? text.replace(withDot, '') : text.replace(phrase, '');
  return next.replace(/\s{2,}/g, ' ').replace(/^\s*[.,]\s*/, '').trim();
}

export function hasPhrase(text: string, phrase: string): boolean {
  return text.includes(phrase);
}

export function togglePhrase(text: string, phrase: string): string {
  return hasPhrase(text, phrase) ? removePhrase(text, phrase) : appendPhrase(text, phrase);
}

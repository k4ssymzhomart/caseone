// Privacy gateway (CLAUDE.md §16): personal data never leaves for an external LLM in clear text.
// redact() replaces directory names (Russian and Kazakh case forms), «Фамилия И.», «Имя Фамилия» in both
// orders, directory tab numbers and phone numbers with pseudonyms (E01…E15, M01, M02, R01, A01).
// rehydrate() maps pseudonyms back to short names for display. Names outside the directory stay as they are.

export interface DirectoryEmployee {
  /** Surname first, as in employees.full_name: «Ахметов Ерлан». */
  full_name: string;
  /** «Ахметов Е.» */
  short_name: string;
  tab_no: string;
  pseudonym: string;
  phone?: string | null;
}

export interface DirectoryEntry {
  pseudonym: string;
  short_name: string;
  full_name: string;
  surname: string;
  first_name: string;
  tab_no: string;
}

export interface PrivacyDirectory {
  readonly entries: readonly DirectoryEntry[];
  redact<T>(value: T): T;
  rehydrate<T>(value: T): T;
}

/** Replacement for a phone number that does not belong to anyone in the directory. */
export const PHONE_PLACEHOLDER = '[телефон]';

const WORD = '\\p{L}\\p{N}';
const START = `(?<![${WORD}])`;
const END = `(?![${WORD}])`;

/** Spelling variants: ё often written as е; Kazakh letters often typed with their Russian look-alikes. */
const VARIANTS: Readonly<Record<string, string>> = {
  ё: 'ёе',
  а: 'аә',
  о: 'оө',
  у: 'уұү',
  и: 'иі',
  к: 'кқ',
  г: 'гғ',
  н: 'нң',
  х: 'хһ',
};

/** Russian endings of surnames in -ов/-ев/-ин (masculine and feminine, singular and plural). */
const RU_OV = ['', 'а', 'у', 'ым', 'е', 'ой', 'ою', 'ы', 'ых', 'ыми'];
const RU_CONSONANT = ['', 'а', 'у', 'ом', 'е'];
const RU_SKY = ['ий', 'ого', 'ому', 'им', 'ом', 'ая', 'ой', 'ую', 'ие', 'их', 'ими'];
const RU_SKAYA = ['ая', 'ой', 'ую', 'ою'];
const RU_A = ['а', 'ы', 'и', 'е', 'у', 'ой', 'ою'];
const RU_YA = ['я', 'и', 'е', 'ю', 'ей', 'ею'];
/** Kazakh case suffixes added to the nominative: genitive, dative, accusative, locative, ablative, instrumental. */
// prettier-ignore
const KZ_SUFFIXES = [
  'тың', 'тің', 'дың', 'дің', 'ның', 'нің',
  'қа', 'ке', 'ға', 'ге', 'на', 'не',
  'ты', 'ті', 'ды', 'ді', 'ны', 'ні',
  'та', 'те', 'да', 'де', 'нда', 'нде',
  'тан', 'тен', 'дан', 'ден', 'нан', 'нен',
  'пен', 'бен', 'мен',
];

function escapeChar(ch: string): string {
  return /[\\^$.*+?()[\]{}|/-]/.test(ch) ? `\\${ch}` : ch;
}

/** A character class for one letter; `upper` limits it to capital letters. */
function letterClass(ch: string, upper: boolean): string {
  const lower = ch.toLowerCase();
  const variants = VARIANTS[lower] ?? lower;
  const set = new Set<string>();
  for (const v of variants) {
    set.add(v.toUpperCase());
    if (!upper) set.add(v);
  }
  if (set.size === 1) return escapeChar([...set][0] ?? ch);
  return `[${[...set].map(escapeChar).join('')}]`;
}

/** Pattern for a literal word, case-insensitive except where `capitalFirst` asks for a capital first letter. */
function wordPattern(word: string, capitalFirst = false): string {
  return [...word].map((ch, i) => letterClass(ch, capitalFirst && i === 0)).join('');
}

function alternation(parts: readonly string[]): string {
  const unique = [...new Set(parts)].sort((a, b) => b.length - a.length);
  return unique.map((p) => wordPattern(p)).join('|');
}

function surnameDeclension(surname: string): { stem: string; endings: string[] } {
  const s = surname.toLowerCase();
  if (/(ов|ев|ёв|ин|ын)$/.test(s)) return { stem: surname, endings: RU_OV };
  if (/(ова|ева|ёва|ина|ына)$/.test(s)) return { stem: surname.slice(0, -1), endings: RU_OV };
  if (/(ский|цкий)$/.test(s)) return { stem: surname.slice(0, -2), endings: RU_SKY };
  if (/(ская|цкая)$/.test(s)) return { stem: surname.slice(0, -2), endings: RU_SKAYA };
  // Петренко, Ткаченко, Шевчук-like -ых/-их and vowel endings do not decline.
  if (/(ко|ых|их|[оиуеэю])$/.test(s)) return { stem: surname, endings: [''] };
  if (/а$/.test(s)) return { stem: surname.slice(0, -1), endings: RU_A };
  if (/я$/.test(s)) return { stem: surname.slice(0, -1), endings: RU_YA };
  return { stem: surname, endings: RU_CONSONANT };
}

function firstNameDeclension(name: string): { stem: string; endings: string[] } {
  const s = name.toLowerCase();
  if (/й$/.test(s)) return { stem: name.slice(0, -1), endings: ['й', 'я', 'ю', 'ем', 'е'] };
  if (/ь$/.test(s)) return { stem: name.slice(0, -1), endings: ['ь', 'я', 'ю', 'ем', 'е'] };
  if (/а$/.test(s)) return { stem: name.slice(0, -1), endings: RU_A };
  if (/я$/.test(s)) return { stem: name.slice(0, -1), endings: RU_YA };
  if (/[оиуеэю]$/.test(s)) return { stem: name, endings: [''] };
  return { stem: name, endings: RU_CONSONANT };
}

/** Every case form of a name: Russian endings on the stem, Kazakh suffixes on the nominative. */
function formsPattern(
  nominative: string,
  decl: { stem: string; endings: string[] },
  capitalFirst: boolean,
): string {
  const stem = wordPattern(decl.stem, capitalFirst);
  const nom = wordPattern(nominative, capitalFirst);
  return `(?:${stem}(?:${alternation(decl.endings)})|${nom}(?:${alternation(KZ_SUFFIXES)}))`;
}

interface CompiledEntry {
  entry: DirectoryEntry;
  names: RegExp;
  tab: RegExp | null;
  phoneDigits: string | null;
}

function digitsOf(phone: string): string {
  const d = phone.replace(/\D/g, '');
  // 8 707 … and +7 707 … are the same number
  return d.length === 11 && (d.startsWith('8') || d.startsWith('7')) ? d.slice(1) : d;
}

const PHONE_RE = /(?<![\d+])(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/gu;

function compile(e: DirectoryEmployee): CompiledEntry {
  const [surname = '', firstName = ''] = e.full_name.trim().split(/\s+/);
  const entry: DirectoryEntry = {
    pseudonym: e.pseudonym,
    short_name: e.short_name,
    full_name: e.full_name,
    surname,
    first_name: firstName,
    tab_no: e.tab_no,
  };
  // Short surnames (Ким) only match with a capital first letter, so ordinary words stay untouched.
  const sur = formsPattern(surname, surnameDeclension(surname), [...surname].length <= 3);
  const alts: string[] = [];
  if (firstName) {
    const first = formsPattern(firstName, firstNameDeclension(firstName), false);
    const initial = letterClass(firstName.charAt(0), true);
    alts.push(`${first}\\s+${sur}`); // Ерлан Ахметов
    alts.push(`${sur}\\s+${first}`); // Ахметов Ерлан
    alts.push(`${sur}\\s+${initial}\\.(?:\\s?\\p{Lu}\\.)?`); // Ахметов Е. / Ахметов Е.Б.
    alts.push(`${initial}\\.\\s?${sur}`); // Е. Ахметов
  }
  alts.push(sur); // Ахметов, Ахметову, Ахметовқа
  const names = new RegExp(`${START}(?:${alts.join('|')})${END}`, 'gu');
  const tab = /^\d+$/.test(e.tab_no)
    ? new RegExp(`(?<![\\d№#])(?<![№#]\\s)${e.tab_no}(?!\\d)`, 'gu')
    : null;
  return { entry, names, tab, phoneDigits: e.phone ? digitsOf(e.phone) : null };
}

function walk(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, fn));
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value) as unknown;
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, fn);
    return out;
  }
  return value;
}

export function buildDirectory(employees: readonly DirectoryEmployee[]): PrivacyDirectory {
  const compiled = employees.filter((e) => e.pseudonym && e.full_name).map(compile);
  const byPseudonym = new Map(
    compiled.map((c) => [c.entry.pseudonym, c.entry.short_name] as const),
  );
  const byPhone = new Map(
    compiled
      .filter((c) => c.phoneDigits)
      .map((c) => [c.phoneDigits ?? '', c.entry.pseudonym] as const),
  );
  const pseudonyms = [...byPseudonym.keys()]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/\W/g, '\\$&'));
  const rehydrateRe =
    pseudonyms.length > 0 ? new RegExp(`${START}(?:${pseudonyms.join('|')})${END}`, 'gu') : null;

  const redactString = (input: string): string => {
    let s = input;
    for (const c of compiled) s = s.replace(c.names, c.entry.pseudonym);
    s = s.replace(PHONE_RE, (m) => byPhone.get(digitsOf(m)) ?? PHONE_PLACEHOLDER);
    for (const c of compiled) if (c.tab) s = s.replace(c.tab, c.entry.pseudonym);
    return s;
  };
  const rehydrateString = (input: string): string =>
    rehydrateRe ? input.replace(rehydrateRe, (m) => byPseudonym.get(m) ?? m) : input;

  return {
    entries: compiled.map((c) => c.entry),
    redact: <T>(value: T): T => walk(value, redactString) as T,
    rehydrate: <T>(value: T): T => walk(value, rehydrateString) as T,
  };
}

/** Walks strings, arrays and plain objects and replaces personal data with pseudonyms. */
export function redact<T>(value: T, directory: PrivacyDirectory): T {
  return directory.redact(value);
}

/** Maps pseudonyms back to short names («E01» → «Ахметов Е.») for display. */
export function rehydrate<T>(value: T, directory: PrivacyDirectory): T {
  return directory.rehydrate(value);
}

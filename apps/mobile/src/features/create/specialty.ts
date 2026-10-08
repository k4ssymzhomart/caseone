// Required specialty for the AI executor suggestion (CLAUDE.md §10), in its order: the description keywords,
// then the equipment type default (equipment_type_specialty), then the suggested fault code's specialty.

/** CLAUDE.md §10 keyword map, in its order. Ties go to the earlier specialty. */
const KEYWORDS: readonly (readonly [specialty: string, pattern: RegExp])[] = [
  ['слесарь', /течь|масл|гидрав|подшип|лент|редукт|вибрац|шум/g],
  ['электромонтёр', /электр|кабел|двигател|автомат|пускат|датчик|щит|освещ|искр/g],
  ['сварщик', /свар|трещин|излом|разрыв металл/g],
  ['смазчик', /смаз/g],
];

/**
 * Phrases that the single keywords get wrong. «Загрязнение масла» and «замена масла» are lubrication work
 * (fault code С-02, смазчик), although «масл» alone points to the fitter.
 */
const PHRASES: readonly (readonly [specialty: string, pattern: RegExp])[] = [
  ['смазчик', /(загрязн|замен)\S*\s+масл/],
];

/** «Течь масла» → слесарь; «Искрит кабель» → электромонтёр; no keyword → null. The most matches wins. */
export function specialtyFromText(text: string): string | null {
  const s = text.toLowerCase().replace(/ё/g, 'е');
  if (!s.trim()) return null;
  for (const [specialty, pattern] of PHRASES) {
    if (pattern.test(s)) return specialty;
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [specialty, pattern] of KEYWORDS) {
    const count = s.match(pattern)?.length ?? 0;
    if (count > bestCount) {
      best = specialty;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Keywords of the description, else the equipment type's default, else the suggested fault code's specialty,
 * else null (suggest_assignees then falls back to the equipment type itself).
 */
export function requiredSpecialty(
  description: string,
  typeSpecialty: string | null,
  faultCodeSpecialty: string | null,
): string | null {
  return specialtyFromText(description) ?? typeSpecialty ?? faultCodeSpecialty ?? null;
}

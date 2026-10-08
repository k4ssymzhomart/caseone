import { describe, expect, it } from 'vitest';
import directories from '../../seed/directories.json';
import { PHONE_PLACEHOLDER, buildDirectory, redact, rehydrate } from './privacy.ts';
import { SYSTEM_PROMPTS } from './prompts.ts';

const dir = buildDirectory(directories.employees);

describe('privacy: redact', () => {
  it.each([
    'Ахметов',
    'Ахметова',
    'Ахметову',
    'Ахметовым',
    'Ахметове',
    'Ахметовой',
    'Ахметовых',
    'АХМЕТОВУ',
    'ахметовым',
  ])('Russian case form «%s»', (form) => {
    expect(dir.redact(`Наряд передан ${form} вчера.`)).toBe('Наряд передан E01 вчера.');
  });

  it.each([
    'Ахметовтың',
    'Ахметовқа',
    'Ахметовты',
    'Ахметовта',
    'Ахметовтан',
    'Ахметовпен',
    'Ахметовке',
  ])('Kazakh case form «%s»', (form) => {
    expect(dir.redact(`${form} хабарла`)).toBe('E01 хабарла');
  });

  it('Kazakh spelling and ё written as е', () => {
    expect(dir.redact('Жақсылықовқа айт')).toBe('E13 айт');
    expect(dir.redact('мастер Ковалев')).toBe('мастер M02');
    expect(dir.redact('мастер Ковалёву')).toBe('мастер M02');
  });

  it('feminine surnames', () => {
    expect(dir.redact('Садыкова')).toBe('A01');
    expect(dir.redact('у Садыковой')).toBe('у A01');
    expect(dir.redact('Садыковаға')).toBe('A01');
  });

  it('indeclinable and short surnames', () => {
    expect(dir.redact('Петренко и Ткаченко')).toBe('E07 и E14');
    expect(dir.redact('Киму передали, Кимом проверено')).toBe('E09 передали, E09 проверено');
  });

  it('«Фамилия И.» and «И. Фамилия»', () => {
    expect(dir.redact('Исполнитель: Ахметов Е.')).toBe('Исполнитель: E01');
    expect(dir.redact('Ахметов Е. и Иванов С. заменили ролик')).toBe('E01 и E02 заменили ролик');
    expect(dir.redact('выдал Е. Ахметов')).toBe('выдал E01');
    expect(dir.redact('выдал Е.Ахметов')).toBe('выдал E01');
    expect(dir.redact('Ахметов Е.Б. на смене')).toBe('E01 на смене');
  });

  it('first name and surname in both orders, declined, any case', () => {
    expect(dir.redact('Ерлан Ахметов закрыл наряд')).toBe('E01 закрыл наряд');
    expect(dir.redact('Ахметов Ерлан закрыл наряд')).toBe('E01 закрыл наряд');
    expect(dir.redact('передать Ерлану Ахметову')).toBe('передать E01');
    expect(dir.redact('передать Ахметову Ерлану')).toBe('передать E01');
    expect(dir.redact('сергей иванов')).toBe('E02');
    expect(dir.redact('Николаем Беляевым')).toBe('E12');
    expect(dir.redact('Айгерим Садыкова')).toBe('A01');
  });

  it('directory tab numbers, but not order numbers', () => {
    expect(dir.redact('табельный 2001')).toBe('табельный E01');
    expect(dir.redact('таб. 1001, таб.2003')).toBe('таб. M01, таб.E03');
    expect(dir.redact('наряд №2001 закрыт, № 2002 тоже')).toBe('наряд №2001 закрыт, № 2002 тоже');
    expect(dir.redact('подшипник 22001 и 20015')).toBe('подшипник 22001 и 20015');
  });

  it('phone numbers', () => {
    expect(dir.redact('звоните +7 701 234 56 78')).toBe(`звоните ${PHONE_PLACEHOLDER}`);
    expect(dir.redact('тел. 8(707)123-45-67')).toBe(`тел. ${PHONE_PLACEHOLDER}`);
    const withPhone = buildDirectory([
      {
        full_name: 'Ахметов Ерлан',
        short_name: 'Ахметов Е.',
        tab_no: '2001',
        pseudonym: 'E01',
        phone: '+7 701 111 22 33',
      },
    ]);
    expect(withPhone.redact('номер 87011112233')).toBe('номер E01');
  });

  it('every employee of the directory, in every form, becomes the pseudonym', () => {
    for (const e of directories.employees) {
      expect(dir.redact(e.full_name), e.full_name).toBe(e.pseudonym);
      expect(dir.redact(e.short_name), e.short_name).toBe(e.pseudonym);
      expect(dir.redact(e.full_name.split(' ').reverse().join(' ')), e.full_name).toBe(e.pseudonym);
      expect(dir.redact(`таб ${e.tab_no}`), e.tab_no).toBe(`таб ${e.pseudonym}`);
    }
  });

  it('a sentence without directory names comes back unchanged', () => {
    const sentences = [
      'Конвейер К-3: заменили подшипник 22320, шифр М-02, масло И-40А 20 л. Наряд №147 закрыт в 14:30.',
      'Течь масла на насосе НШ-32 устранена, кольцо уплотнительное 2 шт, ветошь 1 кг.',
      'Сергей пришёл к Ерлану, Олег на смене.',
      'Кимберлит и ким здесь ни при чём, Иванченко тоже.',
      'Петров И. и Смирнова А. не из справочника.',
    ];
    for (const s of sentences) expect(dir.redact(s)).toBe(s);
  });

  it('system prompts pass through unchanged', () => {
    for (const p of Object.values(SYSTEM_PROMPTS)) expect(dir.redact(p)).toBe(p);
  });

  it('walks objects and arrays, keeps other values, never mutates the input', () => {
    const input = {
      a: ['Ахметов', 5, null, true],
      nested: { b: 'Иванову', n: 2001 },
      when: '2026-10-08',
    };
    const copy = structuredClone(input);
    expect(redact(input, dir)).toEqual({
      a: ['E01', 5, null, true],
      nested: { b: 'E02', n: 2001 },
      when: '2026-10-08',
    });
    expect(input).toEqual(copy);
  });
});

describe('privacy: rehydrate', () => {
  it('maps pseudonyms back to short names', () => {
    expect(dir.rehydrate('E01 и M02, но не E011 и не М-02')).toBe(
      'Ахметов Е. и Ковалёв А., но не E011 и не М-02',
    );
  });

  it('rehydrate(redact(x)) restores the short names', () => {
    const x = {
      summary: 'Мастер Жумабаев Нурлан выдал наряд Ахметову Ерлану, контроль Тлеубаев М.',
      list: ['Иванов С. заменил ролик', 'Садыкова проверила'],
    };
    const back = rehydrate(redact(x, dir), dir);
    expect(back).toEqual({
      summary: 'Мастер Жумабаев Н. выдал наряд Ахметов Е., контроль Тлеубаев М.',
      list: ['Иванов С. заменил ролик', 'Садыкова А. проверила'],
    });
    for (const e of directories.employees)
      expect(dir.rehydrate(dir.redact(e.full_name))).toBe(e.short_name);
  });
});

// Every number the film shows, with the file that holds the measurement. Nothing here is an estimate.
// If a number changes, change it here and in its source together.

export type FilmNumber = {
  value: number;
  /** Digits after the decimal comma. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: string;
  source: string;
};

export const NUMBERS = {
  golden: {
    value: 10,
    suffix: " из 10",
    label: "эталонных случаев: вердикт ИИ совпал с ожидаемым",
    source: "docs/golden-results.md · Sonnet 5.5",
  },
  redScreen: {
    value: 1.9,
    decimals: 1,
    suffix: " с",
    label: "от «Выдать» у мастера до красного экрана у исполнителя",
    source: "docs/progress.md · P7, два браузера",
  },
  verdict: {
    value: 9.5,
    decimals: 1,
    suffix: " с",
    label: "от отправки отчёта до вердикта ИИ",
    source: "docs/progress.md · P7, тот же прогон",
  },
  checkCost: {
    value: 0.016,
    decimals: 3,
    suffix: " USD",
    label: "в среднем за проверку в эталонном прогоне на Sonnet 5.5",
    source: "docs/golden-results.md · 0,16 USD за 10",
  },
  history: {
    value: 559,
    label: "нарядов истории за 92 дня с шестью заложенными закономерностями",
    source: "docs/progress.md · tools/db-check.ts",
  },
  patterns: {
    value: 22,
    suffix: " из 22",
    label: "измерений закономерностей P1…P6 найдены в пределах ±20%",
    source: "docs/phase6-acceptance.md",
  },
  shiftReport: {
    value: 5,
    suffix: " из 5",
    label: "окон отчёта смены сходятся с ручным подсчётом в SQL",
    source: "docs/phase5-acceptance.md",
  },
  tests: {
    value: 660,
    label: "автотестов проходят: домен, правила ИИ, рейтинг, шлюз приватности",
    source: "npx vitest run · 09.10.2026",
  },
  // Used inside scenes, not on the numbers page.
  shiftSummarySec: {
    value: 6.6,
    decimals: 1,
    suffix: " с",
    label: "Sonnet пишет сводку смены",
    source: "docs/phase5-acceptance.md",
  },
  serikovF: {
    value: 64.7,
    decimals: 1,
    suffix: "%",
    label: "Сериков Д.: с первого раза за 92 дня",
    source: "docs/phase5-acceptance.md",
  },
  teamF: {
    value: 91.3,
    decimals: 1,
    suffix: "%",
    label: "медиана команды",
    source: "docs/phase5-acceptance.md",
  },
} as const satisfies Record<string, FilmNumber>;

/** Russian number format: decimal comma, thin space between thousands. */
export const formatRu = (value: number, decimals = 0): string => {
  const fixed = value.toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return frac ? `${grouped},${frac}` : grouped;
};

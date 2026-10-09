// The film's running order (STORYBOARD.md). Durations in frames at 30 fps; neighbouring scenes cross for TRANSITION
// frames, so the film is the sum of the durations minus one transition per cut.
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const TRANSITION = 12;

export type SceneId =
  | "s01-cold-open"
  | "s02-problem"
  | "s03-issue"
  | "s04-accept"
  | "s05-deadline"
  | "s06-close"
  | "s07-check"
  | "s08-verdict"
  | "s09-rework"
  | "s10-shift-report"
  | "s11-rating"
  | "s12-dashboard"
  | "s12-analytics"
  | "s13-architecture"
  | "s13-privacy"
  | "s14-numbers"
  | "s15-outro";

export type SceneMeta = { id: SceneId; frames: number; chapter?: string };

export const SCENES: SceneMeta[] = [
  { id: "s01-cold-open", frames: 240 },
  { id: "s02-problem", frames: 380 },
  { id: "s03-issue", frames: 540, chapter: "Выдача" },
  { id: "s04-accept", frames: 450, chapter: "Принятие" },
  { id: "s05-deadline", frames: 420, chapter: "Сроки" },
  { id: "s06-close", frames: 258, chapter: "Закрытие" },
  { id: "s07-check", frames: 270, chapter: "Проверка ИИ" },
  { id: "s08-verdict", frames: 315, chapter: "Вердикт" },
  { id: "s09-rework", frames: 420, chapter: "Доработка" },
  { id: "s10-shift-report", frames: 300, chapter: "Отчёт смены" },
  { id: "s11-rating", frames: 290, chapter: "Рейтинг" },
  { id: "s12-dashboard", frames: 195, chapter: "Сводка" },
  { id: "s12-analytics", frames: 345, chapter: "Аналитика" },
  { id: "s13-architecture", frames: 300 },
  { id: "s13-privacy", frames: 285 },
  { id: "s14-numbers", frames: 300 },
  { id: "s15-outro", frames: 240 },
];

/** Start frame of each scene in the finished film (transitions overlap neighbours). */
export const sceneStarts = (): Record<SceneId, number> => {
  const starts = {} as Record<SceneId, number>;
  let t = 0;
  SCENES.forEach((s, i) => {
    starts[s.id] = t;
    t += s.frames - (i < SCENES.length - 1 ? TRANSITION : 0);
  });
  return starts;
};

export const FILM_FRAMES = SCENES.reduce((sum, s) => sum + s.frames, 0) - TRANSITION * (SCENES.length - 1);

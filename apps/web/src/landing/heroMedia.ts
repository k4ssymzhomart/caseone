// What the hero asks the browser for, shared by main.tsx (which preloads it before the landing chunk arrives) and
// sections/Hero.tsx, so a preload always matches the request it stands in for.

/**
 * Screens that get the 4K backdrop; the same query sits in sections/Hero.module.css (CSS cannot import it). Under
 * 1024 px the silk sits behind the phone only and always uses the 1920 file.
 */
export const HERO_BIG_BACKDROP =
  '(min-width: 1024px) and (min-resolution: 1.5dppx), (min-width: 1921px)';

/** `sizes` of the phone screen: about 0.93 of the phone body width set in Hero.module.css. */
export const HERO_SCREEN_SIZES = '(max-width: 767px) 280px, (max-width: 1279px) 320px, 430px';

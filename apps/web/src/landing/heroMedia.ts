// What the hero asks the browser for, shared by main.tsx (which preloads it before the landing chunk arrives) and
// sections/Hero.tsx, so a preload always matches the request it stands in for. The same queries sit in
// sections/Hero.module.css (CSS cannot import them).

/** Phones: hero-light-phone.webp. */
export const HERO_PHONE_BACKDROP = '(max-width: 767px)';

/** Tablets: hero-light-tablet.webp. */
export const HERO_TABLET_BACKDROP = '(min-width: 768px) and (max-width: 1023px)';

/** 1024 to 1199 px: the 9 : 10 stage (hero-light-stage-narrow-*.webp), its 2400 file on retina screens. */
export const HERO_NARROW_BACKDROP = '(min-width: 1024px) and (max-width: 1199px)';

/**
 * From 1200 px the 6 : 5 stage: the 3200 file (hero-light-stage-3200.webp) for retina and 1× screens wider than
 * 1600, the 1600 file for the rest.
 */
export const HERO_BIG_BACKDROP = '(min-resolution: 1.5dppx), (min-width: 1601px)';

/** `sizes` of the phone screen: 0.926 of the phone body width `--hero-phone` set in Hero.module.css. */
export const HERO_SCREEN_SIZES = '(max-width: 767px) 320px, (max-width: 1279px) 360px, 470px';

// Two entry points in one app. A signed out visitor at `/` gets the landing page alone (React and the page, no API
// client, no router); everything else boots the panel, whose router also shows the landing at `/` when the stored
// session turns out to be gone, and sends signed in staff to their home page.
import './styles/global.css';
import {
  HERO_BIG_BACKDROP,
  HERO_NARROW_BACKDROP,
  HERO_PHONE_BACKDROP,
  HERO_SCREEN_SIZES,
  HERO_TABLET_BACKDROP,
} from './landing/heroMedia';
import { isLandingVisit } from './lib/sessionHint';

const root = document.getElementById('root')!;

if (isLandingVisit()) {
  preloadHero();
  void import('./landing/mount').then((m) => m.mountLanding(root));
} else {
  void import('./panel').then((m) => m.mountPanel(root));
}

/** The backdrop file Hero.module.css picks for this screen, by the same queries. */
function heroBackdrop(): string {
  const fits = (query: string) => window.matchMedia(query).matches;
  const big = fits(HERO_BIG_BACKDROP);
  if (fits(HERO_PHONE_BACKDROP))
    return new URL('./landing/assets/hero-light-phone.jpg', import.meta.url).href;
  if (fits(HERO_TABLET_BACKDROP))
    return new URL('./landing/assets/hero-light-tablet.jpg', import.meta.url).href;
  if (fits(HERO_NARROW_BACKDROP))
    return big
      ? new URL('./landing/assets/hero-light-stage-narrow-2400.jpg', import.meta.url).href
      : new URL('./landing/assets/hero-light-stage-narrow-1200.jpg', import.meta.url).href;
  return big
    ? new URL('./landing/assets/hero-light-stage-3200.jpg', import.meta.url).href
    : new URL('./landing/assets/hero-light-stage-1600.jpg', import.meta.url).href;
}

/**
 * The hero's two big images start now, in parallel with the landing chunk: the light backdrop and the phone's screen
 * (the srcset and sizes of the DeviceFrame <img> in landing/sections/Hero.tsx). Either can be the page's largest
 * contentful paint.
 */
function preloadHero(): void {
  const backdrop = document.createElement('link');
  backdrop.rel = 'preload';
  backdrop.as = 'image';
  backdrop.href = heroBackdrop();
  backdrop.fetchPriority = 'high';

  const screen = document.createElement('link');
  screen.rel = 'preload';
  screen.as = 'image';
  screen.imageSrcset = [
    `${new URL('./landing/assets/device/master-shift-light-600.webp', import.meta.url).href} 600w`,
    `${new URL('./landing/assets/device/master-shift-light-900.webp', import.meta.url).href} 900w`,
  ].join(', ');
  screen.imageSizes = HERO_SCREEN_SIZES;
  screen.fetchPriority = 'high';

  document.head.append(backdrop, screen);
}

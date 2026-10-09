// Two entry points in one app. A signed out visitor at `/` gets the landing page alone (React and the page, no API
// client, no router); everything else boots the panel, whose router also shows the landing at `/` when the stored
// session turns out to be gone, and sends signed in staff to their home page.
import './styles/global.css';
import { HERO_BIG_BACKDROP, HERO_SCREEN_SIZES } from './landing/heroMedia';
import { isLandingVisit } from './lib/sessionHint';

const root = document.getElementById('root')!;

if (isLandingVisit()) {
  preloadHero();
  void import('./landing/mount').then((m) => m.mountLanding(root));
} else {
  void import('./panel').then((m) => m.mountPanel(root));
}

/**
 * The hero's two big images start now, in parallel with the landing chunk: the backdrop (one of two files, by the
 * query Hero.module.css uses) and the phone's screen, the page's largest contentful paint (the srcset and sizes of
 * the DeviceFrame <img> in landing/sections/Hero.tsx).
 */
function preloadHero(): void {
  const big = window.matchMedia(HERO_BIG_BACKDROP).matches;
  const backdrop = document.createElement('link');
  backdrop.rel = 'preload';
  backdrop.as = 'image';
  backdrop.href = big
    ? new URL('./landing/assets/hero-bg-3840.jpg', import.meta.url).href
    : new URL('./landing/assets/hero-bg-1920.jpg', import.meta.url).href;
  backdrop.fetchPriority = 'high';

  const screen = document.createElement('link');
  screen.rel = 'preload';
  screen.as = 'image';
  screen.imageSrcset = [
    `${new URL('./landing/assets/device/emergency-600.webp', import.meta.url).href} 600w`,
    `${new URL('./landing/assets/device/emergency-900.webp', import.meta.url).href} 900w`,
  ].join(', ');
  screen.imageSizes = HERO_SCREEN_SIZES;
  screen.fetchPriority = 'high';

  document.head.append(backdrop, screen);
}

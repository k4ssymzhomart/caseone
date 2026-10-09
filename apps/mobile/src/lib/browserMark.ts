// The browser's own mark for the PWA's push row (docs/design.md §10): Chrome or Safari, none for other browsers.
// Pure, so the user agent rules are tested without React Native.
import { chromeLogo, safariLogo, type PlatformLogo } from '@rota/design';

export interface PlatformMark {
  logo: PlatformLogo;
  /** i18n key of the visible name under «Push». */
  label: string;
}

/** Chromium browsers that are not Chrome and Firefox carry «Chrome/» or «Safari/» too: no mark for them. */
const OTHER_BROWSER = /Edg\/|EdgiOS|OPR\/|Opera|YaBrowser|SamsungBrowser|Firefox\/|FxiOS/;

export function webBrowserMark(userAgent: string): PlatformMark | null {
  if (OTHER_BROWSER.test(userAgent)) return null;
  if (/Chrome\/|CriOS\//.test(userAgent)) return { logo: chromeLogo, label: 'profile.pushOn.chrome' };
  if (/Safari\//.test(userAgent)) return { logo: safariLogo, label: 'profile.pushOn.safari' };
  return null;
}

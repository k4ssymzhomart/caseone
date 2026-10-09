// Type check only (never imported at runtime): every web platform file (*.web.ts) exports each value of its
// native twin with a compatible type. Metro picks the .web file for the PWA export, but tsc only sees the
// native one through imports, so without this a native export added later would break the web build silently.
import type * as kitPhotosNative from '../features/kit/photos';
import type * as kitPhotosWeb from '../features/kit/photos.web';
import type * as fitTextNative from '../ui/fitText';
import type * as fitTextWeb from '../ui/fitText.web';
import type * as glassNative from '../ui/glass';
import type * as glassWeb from '../ui/glass.web';

import type * as backNative from './hardwareBack';
import type * as backWeb from './hardwareBack.web';
import type * as hapticsNative from './haptics';
import type * as hapticsWeb from './haptics.web';
import type * as holdNative from './navigatorHold';
import type * as holdWeb from './navigatorHold.web';
import type * as notificationsNative from './notifications';
import type * as notificationsWeb from './notifications.web';
import type * as photoNative from './photo';
import type * as photoWeb from './photo.web';
import type * as sirenNative from './siren';
import type * as sirenWeb from './siren.web';

type Assert<T extends true> = T;
/** No native export is missing on the web, and each web value fits the native type. */
type Same<Web, Native> = [Exclude<keyof Native, keyof Web>] extends [never]
  ? { [K in keyof Native]: K extends keyof Web ? Web[K] : never } extends Native
    ? true
    : false
  : false;

export type PlatformParity = [
  Assert<Same<typeof fitTextWeb, typeof fitTextNative>>,
  Assert<Same<typeof glassWeb, typeof glassNative>>,
  Assert<Same<typeof kitPhotosWeb, typeof kitPhotosNative>>,
  Assert<Same<typeof backWeb, typeof backNative>>,
  Assert<Same<typeof hapticsWeb, typeof hapticsNative>>,
  Assert<Same<typeof holdWeb, typeof holdNative>>,
  Assert<Same<typeof notificationsWeb, typeof notificationsNative>>,
  Assert<Same<typeof photoWeb, typeof photoNative>>,
  Assert<Same<typeof sirenWeb, typeof sirenNative>>,
];

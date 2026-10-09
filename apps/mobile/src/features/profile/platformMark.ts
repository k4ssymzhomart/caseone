// Which platform this device's push goes through, for the mark on the profile's push row: the Android mark on
// Android, the Apple mark on iOS, the browser's own mark in the PWA (Chrome or Safari; none for other browsers).
import { androidLogo, appleLogo } from '@rota/design';
import { Platform } from 'react-native';

import { webBrowserMark, type PlatformMark } from '@/lib/browserMark';

export function pushPlatformMark(): PlatformMark | null {
  if (Platform.OS === 'android') return { logo: androidLogo, label: 'profile.pushOn.android' };
  if (Platform.OS === 'ios') return { logo: appleLogo, label: 'profile.pushOn.ios' };
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
  return typeof ua === 'string' ? webBrowserMark(ua) : null;
}

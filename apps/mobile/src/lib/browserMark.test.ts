import { chromeLogo, safariLogo } from '@rota/design';
import { describe, expect, it } from 'vitest';

import { webBrowserMark } from './browserMark';

const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  firefoxIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
};

describe('webBrowserMark', () => {
  it('shows the Chrome mark in Chrome on Android, macOS and iOS', () => {
    for (const ua of [UA.chromeAndroid, UA.chromeMac, UA.chromeIos]) {
      expect(webBrowserMark(ua)).toEqual({ logo: chromeLogo, label: 'profile.pushOn.chrome' });
    }
  });

  it('shows the Safari mark in Safari', () => {
    expect(webBrowserMark(UA.safariIos)).toEqual({ logo: safariLogo, label: 'profile.pushOn.safari' });
  });

  it('shows no mark for browsers outside the set, though their agents name Chrome or Safari', () => {
    for (const ua of [UA.edge, UA.samsung, UA.firefox, UA.firefoxIos, '']) {
      expect(webBrowserMark(ua)).toBeNull();
    }
  });
});

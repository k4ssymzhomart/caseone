// Every URL of the landing page (docs/LANDING.md §6). Public URLs only.
// An empty string renders the button disabled with «· скоро», never a dead link.
export const links = {
  /** Android APK (a public URL: a private repo's releases will not open for the jury). */
  apk: 'https://expo.dev/artifacts/eas/fnTA-JZAfTHP7Ota0PJ5E7Omk77HNJRTzcGDBrhChUw.apk',
  /** The web panel lives in this app: the landing is `/`, the panel starts at `/login`. */
  panel: '/login',
  /** The mobile app as a PWA in any browser, iPhone included (the APK stays the full experience). */
  app: '/app/',
  /** Demo video ≤ 3 min (YouTube unlisted or Drive). */
  video: '',
  /** Pitch PDF, for example '/rota-pitch.pdf' in public/. */
  pitch: '',
  repo: 'https://github.com/k4ssymzhomart/caseone',
} as const;

export type LinkName = keyof typeof links;

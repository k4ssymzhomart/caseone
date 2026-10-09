// Every URL of the landing page (docs/LANDING.md §6). Public URLs only.
// An empty string renders the button disabled with «· скоро», never a dead link.
export const links = {
  /** Android APK (a public URL: a private repo's releases will not open for the jury). */
  apk: 'https://expo.dev/artifacts/eas/fnTA-JZAfTHP7Ota0PJ5E7Omk77HNJRTzcGDBrhChUw.apk',
  /** The web panel lives in this app: the landing is `/`, the panel starts at `/login`. */
  panel: '/login',
  /** The mobile app as a PWA in any browser, iPhone included (the APK stays the full experience). */
  app: '/app/',
  /** Demo film, 2:58, public on YouTube (video/YOUTUBE.md). */
  video: 'https://youtu.be/qu7YrDZdqXI',
  /** The 10 slide deck, served from public/ (docs/presentation/rota-presentation.pdf). */
  pitch: '/rota-presentation.pdf',
  repo: 'https://github.com/k4ssymzhomart/caseone',
} as const;

export type LinkName = keyof typeof links;

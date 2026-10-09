// The browser Remotion renders with. The bundled chrome-headless-shell hangs on some Macs (no requestAnimationFrame),
// so prefer an installed Chrome; REMOTION_CHROME=<path> picks another one, REMOTION_CHROME=bundled keeps Remotion's.
import { existsSync } from "node:fs";

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export const chromeExecutable = () => {
  const env = process.env.REMOTION_CHROME;
  if (env === "bundled") return null;
  if (env) return env;
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
};

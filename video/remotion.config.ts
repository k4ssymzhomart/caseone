/**
 * Remotion CLI config for the Rota demo film. Node APIs ignore this file; scripts/stills.mjs passes the same
 * options itself. All options: https://remotion.dev/docs/config
 */
import { existsSync } from "node:fs";
import { Config } from "@remotion/cli/config";
import { chromeExecutable } from "./scripts/chrome.mjs";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setCodec("h264");
Config.setCrf(18);
Config.setPixelFormat("yuv420p");

// On this Mac (Apple M4, macOS 15) the downloaded chrome-headless-shell never fires requestAnimationFrame, so the
// render waits forever for the root component. Installed Google Chrome works; REMOTION_CHROME overrides the path.
const chrome = chromeExecutable();
if (chrome && existsSync(chrome)) {
  Config.setBrowserExecutable(chrome);
}

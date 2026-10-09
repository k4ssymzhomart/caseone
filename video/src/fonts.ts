// Inter and Geist Mono from public/fonts (copied by scripts/sync-assets.mjs from the apps' own font packages).
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

const faces: Array<[family: string, file: string, weight: string]> = [
  ["Inter", "Inter_400Regular.ttf", "400"],
  ["Inter", "Inter_500Medium.ttf", "500"],
  ["Inter", "Inter_600SemiBold.ttf", "600"],
  ["Inter", "Inter_700Bold.ttf", "700"],
  ["Inter", "Inter_800ExtraBold.ttf", "800"],
  ["Geist Mono", "GeistMono_400Regular.ttf", "400"],
  ["Geist Mono", "GeistMono_500Medium.ttf", "500"],
  ["Geist Mono", "GeistMono_600SemiBold.ttf", "600"],
];

export const fontsReady = Promise.all(
  faces.map(([family, file, weight]) =>
    loadFont({ family, url: staticFile(`fonts/${file}`), weight, display: "block" }),
  ),
);

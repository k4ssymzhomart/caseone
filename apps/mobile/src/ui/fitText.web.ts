// Web build (DEPLOY_VM.md §4): react-native-web ignores adjustsFontSizeToFit, so a one line label that does not
// fit is cut with an ellipsis («Вы…» for «Выдать»). This measures the text and scales its font size down to
// minimumFontScale, like the native Text, and measures again whenever the box changes size. Browser text runs a
// little wider than the native one, so the floor goes down to 0.7 at most: a slightly smaller word reads better
// than a cut one (the master's «Выдать» pill on a 390 px phone needs 0.78).
import { useLayoutEffect, useRef, useState } from 'react';

const WEB_FLOOR = 0.7;

import type { FitText } from './fitText';

export type { FitText } from './fitText';

export function useFitText(fit: boolean, minimumFontScale: number | undefined, fontSize: number | undefined): FitText {
  const ref = useRef<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!fit || !fontSize || !el || typeof el.getBoundingClientRect !== 'function') return;
    const min = Math.min(minimumFontScale ?? WEB_FLOOR, WEB_FLOOR);
    const measure = () => {
      // Fractional widths: scrollWidth and clientWidth round, and half a pixel too wide still shows «…».
      const available = el.getBoundingClientRect().width;
      const range = document.createRange();
      range.selectNodeContents(el);
      const text = range.getBoundingClientRect().width || el.scrollWidth;
      // Text width is linear in the font size: the width at full size is the current one over the current scale.
      const natural = text / scaleRef.current;
      if (!available || !natural) return;
      const next = Math.max(min, Math.min(1, Math.floor((available / natural) * 100) / 100));
      if (Math.abs(next - scaleRef.current) >= 0.01) {
        scaleRef.current = next;
        setScale(next);
      }
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [fit, fontSize, minimumFontScale]);

  if (!fit || !fontSize) return {};
  return { ref, ...(scale < 1 ? { style: { fontSize: fontSize * scale } } : {}) };
}

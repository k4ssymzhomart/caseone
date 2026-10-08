// Demo tap counter (CLAUDE.md §20): taps and seconds since «Выдать» opened the create screen.
import { plural, type PluralForms } from '@rota/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '@/lib/i18n';

/** The tab bar tap on «Выдать» that opened the screen is the first of the case's 5 taps. */
const TAPS_BEFORE_OPEN = 1;

function tapForms(): PluralForms {
  return [t('create.tap.one'), t('create.tap.few'), t('create.tap.many')];
}

function clock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** «5 нажатий · 0:38». */
export function formatTaps(taps: number, seconds: number): string {
  return t('create.taps', { count: taps, word: plural(taps, tapForms()), time: clock(seconds) });
}

/** «5 нажатий» without the time, for the success HUD. */
export function formatTapsShort(taps: number): string {
  return `${taps} ${plural(taps, tapForms())}`;
}

export interface TapCounter {
  /** Counts one tap on an interactive element of the screen. */
  tap: () => void;
  /** Text for the TapCounter capsule, refreshed every second while `running`. */
  text: string;
  /** Taps and seconds right now (the success HUD reads it after the last tap). */
  snapshot: () => { taps: number; seconds: number };
}

export function useTapCounter(running: boolean): TapCounter {
  const [startedAt] = useState(() => Date.now());
  const tapsRef = useRef(TAPS_BEFORE_OPEN);
  const [taps, setTaps] = useState(TAPS_BEFORE_OPEN);
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const tap = useCallback(() => {
    tapsRef.current += 1;
    setTaps(tapsRef.current);
  }, []);

  const snapshot = useCallback(
    () => ({ taps: tapsRef.current, seconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) }),
    [startedAt],
  );

  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return { tap, text: formatTaps(taps, seconds), snapshot };
}

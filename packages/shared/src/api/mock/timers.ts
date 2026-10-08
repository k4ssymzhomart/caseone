// Timers without platform typings: packages/shared compiles with lib es2023 only (no DOM, no Node), yet every
// runtime we target (Hermes, browsers, Node) has these globals. Reading them through globalThis keeps the
// package platform free and avoids clashing with the apps' own setTimeout declarations.

export type TimerHandle = unknown;

interface TimerGlobals {
  setTimeout(cb: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  setInterval(cb: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
}

const g = globalThis as unknown as TimerGlobals;

export function later(cb: () => void, ms: number): TimerHandle {
  return g.setTimeout(cb, ms);
}

export function cancelLater(handle: TimerHandle): void {
  g.clearTimeout(handle);
}

export function every(cb: () => void, ms: number): TimerHandle {
  return g.setInterval(cb, ms);
}

export function cancelEvery(handle: TimerHandle): void {
  g.clearInterval(handle);
}

/** Resolves after `ms`; 0 or less resolves on the next microtask. */
export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    g.setTimeout(resolve, ms);
  });
}

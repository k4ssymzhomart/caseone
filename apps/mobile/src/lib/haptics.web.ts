// Web build of the haptics (DEPLOY_VM.md §4): browsers have no haptic engine, so every moment is a no-op.
// The emergency vibration lives in siren.web.ts (navigator.vibrate).
const none = (): Promise<void> => Promise.resolve();

export const haptic = {
  light: none,
  medium: none,
  heavy: none,
  success: none,
  error: none,
  warning: none,
  selection: none,
};

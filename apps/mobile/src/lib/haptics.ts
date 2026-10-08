import * as Haptics from 'expo-haptics';

// Haptics per moment (PHASE_0 §0.6). They do nothing on the iOS Simulator, which is expected.
const safe = (p: Promise<void>) => p.catch(() => undefined);

export const haptic = {
  /** Primary button */
  light: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Accept and start */
  medium: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Emergency, repeating */
  heavy: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** AI verdict accepted */
  success: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** AI verdict rework, wrong PIN */
  error: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  warning: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  selection: () => safe(Haptics.selectionAsync()),
};

// Industrial extension of the Rota palette: worker states and AI verdicts.
// Apple system colors, the family the Rota palette comes from. Hand written.

export const statusColors = {
  light: { free: '#34C759', working: '#FFCC00', queue: '#007AFF', off: '#8E8E93', critical: '#FF3B30',
           success: '#34C759', warning: '#FF9500', info: '#007AFF', onWorking: '#1D1D1F' },
  dark:  { free: '#30D158', working: '#FFD60A', queue: '#0A84FF', off: '#98989D', critical: '#FF3B30',
           success: '#30D158', warning: '#FF9F0A', info: '#0A84FF', onWorking: '#1D1D1F' },
} as const;

export const softAlpha = { light: 0.16, dark: 0.22 } as const; // pill and badge fills

export type StatusTone = keyof (typeof statusColors)['light'];
export type StatusColors = { readonly [K in StatusTone]: string };

/** `#RRGGBB` plus an alpha in 0..1 → `#RRGGBBAA`, which React Native and CSS both accept. */
export function withAlpha(hex: string, alpha: number): string {
  const base = hex.length === 9 ? hex.slice(0, 7) : hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${base}${a}`.toUpperCase();
}

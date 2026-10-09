// Whether the glass surfaces (tab bar, HUD capsule) blur what lies behind them. iOS draws the native material;
// Android keeps the flat, stronger glass fill.
import { Platform } from 'react-native';

export const GLASS_BLUR = Platform.OS === 'ios';

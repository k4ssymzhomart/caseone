// Web build (DEPLOY_VM.md §4): expo-blur's web BlurView is a CSS backdrop-filter, so the tab bar and the HUD
// blur the content that scrolls under them as on iOS. A flat translucent fill lets that text show through
// sharp and collide with the labels on top.
export const GLASS_BLUR = true;

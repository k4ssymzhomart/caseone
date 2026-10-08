import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

export interface WindowOverlayProps {
  children: ReactNode;
  /** VoiceOver stays inside the overlay while it is up. True for blocking sheets, false for toasts. */
  modal?: boolean;
}

/**
 * Renders root level overlays (HUD, confirm sheet) above every screen.
 * iOS presents native modals and form sheets (`create`, `emergency/[id]`, `order/[id]/reason`, `worker/[id]`)
 * as view controllers above the root view, so a root overlay or a root `Modal` would sit under them or fail
 * to present. `FullWindowOverlay` draws straight into the window instead. Android keeps every screen in one
 * window, so the children render in place.
 *
 * Mount it only while there is something to show: iOS adds the overlay to the window when it mounts, and a
 * modal presented later lands above an overlay that stayed mounted.
 */
export function WindowOverlay({ children, modal = false }: WindowOverlayProps) {
  if (Platform.OS !== 'ios') return <>{children}</>;
  return (
    <FullWindowOverlay unstable_accessibilityContainerViewIsModal={modal}>
      {children}
    </FullWindowOverlay>
  );
}

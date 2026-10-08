// Toasts in the Rota HUD capsule, at the top center under the top bar. One at a time; a newer toast replaces the
// current one. Notifications from live sync arrive here too (LiveBridge).
//
//   const hud = useHud();
//   hud.show({ monoPrefix: '№147', message: t('status.in_progress') });
//   hud.show({ message: error.message, tone: 'critical' });
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Hud, type HudProps } from './rota';
import styles from './HudHost.module.css';

export interface HudToast extends Omit<HudProps, 'className'> {
  /** Milliseconds on screen; default 2500, notifications use 4000. */
  duration?: number;
}

interface HudApi {
  show(toast: HudToast): void;
  hide(): void;
}

const HudContext = createContext<HudApi>({ show: () => undefined, hide: () => undefined });

export function useHud(): HudApi {
  return useContext(HudContext);
}

export function HudProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(HudToast & { id: number }) | null>(null);
  const seq = useRef(0);
  const timer = useRef<number | null>(null);

  const hide = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback((next: HudToast) => {
    if (timer.current != null) window.clearTimeout(timer.current);
    seq.current += 1;
    setToast({ ...next, id: seq.current });
    timer.current = window.setTimeout(() => setToast(null), next.duration ?? 2500);
  }, []);

  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <HudContext.Provider value={value}>
      {children}
      <div className={styles.host} aria-live="polite">
        {toast ? (
          <Hud
            key={toast.id}
            className={styles.toast}
            message={toast.message}
            monoPrefix={toast.monoPrefix}
            actionLabel={toast.actionLabel}
            onAction={
              toast.onAction
                ? () => {
                    toast.onAction?.();
                    hide();
                  }
                : undefined
            }
            tone={toast.tone}
          />
        ) : null}
      </div>
    </HudContext.Provider>
  );
}

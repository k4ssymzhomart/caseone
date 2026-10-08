// The Rota HUD capsule, copied from the Rota web kit and adapted to this app: the Mac app's six fixed states
// (English copy) became one shape that mirrors the mobile HudToast (PHASE_0 §6.9): the mark, an optional mono
// prefix («№147»), the message, an optional action after a divider. HudProvider and useHud() live in
// src/components/HudHost.tsx.
import { LogoMark } from '../Logo/Logo';
import styles from './Hud.module.css';

export type HudTone = 'default' | 'critical';

export interface HudProps {
  message: string;
  /** Number or code in mono before the message, for example «№147». */
  monoPrefix?: string;
  /** Short verb after a divider, for example «Открыть». */
  actionLabel?: string;
  onAction?: () => void;
  /** `critical` paints the prefix and the edge red; the message still says what happened. */
  tone?: HudTone;
  className?: string;
}

function Divider() {
  return <span className={styles.divider} aria-hidden="true" />;
}

export function Hud({ message, monoPrefix, actionLabel, onAction, tone = 'default', className }: HudProps) {
  return (
    <div
      className={[styles.hud, className].filter(Boolean).join(' ')}
      data-tone={tone === 'critical' ? 'critical' : undefined}
      role="status"
    >
      <LogoMark size={14} />
      {monoPrefix ? <span className={styles.mono}>{monoPrefix}</span> : null}
      <span className={styles.message}>{message}</span>
      {actionLabel ? (
        <>
          <Divider />
          {onAction ? (
            <button type="button" className={styles.action} onClick={onAction}>
              {actionLabel}
            </button>
          ) : (
            <span className={styles.action}>{actionLabel}</span>
          )}
        </>
      ) : null}
    </div>
  );
}

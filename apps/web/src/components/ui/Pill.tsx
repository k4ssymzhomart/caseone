import type { Tone } from '@rota/shared';
import type { ReactNode } from 'react';
import styles from './ui.module.css';

/**
 * Dot plus word in a status tone (status is never color alone). Tones from @rota/shared: statusTone(status),
 * priorityTone(priority), verdictTone(verdict), workerStateTone(state).
 *   <Pill tone={statusTone(o.status)}>{t(`status.${o.status}`)}</Pill>
 */
export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={styles.pill} data-tone={tone}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}

/** A bare status dot, next to text that says the state. */
export function StatusDot({ tone = 'neutral' }: { tone?: Tone }) {
  return <span className={styles.dot} data-tone={tone} aria-hidden="true" />;
}

/** Mono caps capsule with a hairline: fault codes «М-02», «ИИ», priority. `critical` fills red. */
export function Tag({ tone, children }: { tone?: 'critical'; children: ReactNode }) {
  return (
    <span className={styles.tag} data-tone={tone}>
      {children}
    </span>
  );
}

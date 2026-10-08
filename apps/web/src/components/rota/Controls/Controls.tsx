// Copied from the Rota web kit. StatusPill takes its label from the caller (Russian copy goes through t()).
import type { ReactNode } from 'react';
import styles from './Controls.module.css';

interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** macOS style switch, red when on. */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={styles.switch}
      onClick={() => onChange?.(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
}

interface CheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  children: ReactNode;
}

export function Checkbox({ checked, onChange, children }: CheckboxProps) {
  return (
    <label className={styles.checkbox}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange?.(event.target.checked)} />
      <span className={styles.box} aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

/** Layout chip. Filled for the active layout. */
export function Chip({ label, current = false }: { label: string; current?: boolean }) {
  return (
    <span className={styles.chip} data-current={current || undefined}>
      {label}
    </span>
  );
}

/** On or off pill with a dot and a word (status is never color alone). The caller passes the Russian label. */
export function StatusPill({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className={styles.pill} data-on={on || undefined}>
      <span className={styles.dot} />
      {children}
    </span>
  );
}

export function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className={styles.group}>{children}</div>;
}

interface RowProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function SettingsRow({ title, subtitle, children }: RowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowTitle}>{title}</span>
        {subtitle ? <span className={styles.rowSubtitle}>{subtitle}</span> : null}
      </div>
      {children}
    </div>
  );
}

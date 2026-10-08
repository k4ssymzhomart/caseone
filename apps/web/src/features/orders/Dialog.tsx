// A modal sheet on the native <dialog> (focus trap, Escape, top layer for free): glass header with an eyebrow and the
// title, a scrolling body, an optional footer of buttons. Mount it to open it, unmount it to close it, so every
// opening starts with fresh state:
//
//   {open ? <Dialog title="Отменить наряд №147?" onClose={() => setOpen(false)} footer={...}>…</Dialog> : null}
//
// Destructive actions confirm here (PHASE_0 §6.13). `busy` keeps it open while a request runs.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { t } from './strings';
import styles from './dialog.module.css';

interface DialogProps {
  title: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  /** 'm' 560 px (default), 'l' 760 px, 'xl' the photo viewer. */
  size?: 'm' | 'l' | 'xl';
  busy?: boolean;
}

export function Dialog({ title, eyebrow, subtitle, onClose, children, footer, size = 'm', busy }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      data-size={size}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onMouseDown={(e) => {
        // a press on the backdrop lands on the dialog element itself
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className={styles.sheet}>
        <header className={styles.header}>
          <div className={styles.titles}>
            {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label={t('order.dialog.close')}
            onClick={onClose}
            disabled={busy}
          >
            ✕
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </dialog>
  );
}

interface TextAreaProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  invalid?: boolean;
}

/** Multi line field in the panel's field style. */
export function TextArea({ id, value, onChange, placeholder, rows = 4, autoFocus, invalid }: TextAreaProps) {
  return (
    <textarea
      id={id}
      className={styles.textarea}
      value={value}
      rows={rows}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

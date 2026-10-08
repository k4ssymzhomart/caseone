// The confirm sheet of a destructive action (PHASE_0 §6.13): a modal <dialog> with a title, a short body, «Отмена»
// and the red action. Esc and a click on the backdrop cancel; focus starts on «Отмена», so Enter never destroys.
import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/rota';
import { t } from '@/lib/i18n';
import styles from './demo.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel, busyLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className={styles.dialogBody}>
        <h2 id={titleId} className={styles.dialogTitle}>
          {title}
        </h2>
        <p id={bodyId} className={styles.dialogText}>
          {body}
        </p>
        <div className={styles.dialogActions}>
          <Button autoFocus variant="secondary" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

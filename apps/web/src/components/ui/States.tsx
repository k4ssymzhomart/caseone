import { isRotaError } from '@rota/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';
import { Button, LogoMark, Mascot, type MascotName } from '../rota';
import styles from './ui.module.css';

interface EmptyStateProps {
  /** One mascot per screen, only on empty, success, error, waiting and onboarding states (PHASE_0 §6.11). */
  mascot?: MascotName;
  mascotSize?: number;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ mascot = 'peek', mascotSize = 120, title, text, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <Mascot name={mascot} size={mascotSize} />
      <h2 className={styles.emptyTitle}>{title}</h2>
      {text ? <p className={styles.emptyText}>{text}</p> : null}
      {action}
    </div>
  );
}

/** A quiet spinning mark with «Загружаем». */
export function Loading({ label }: { label?: string }) {
  return (
    <div className={styles.loading} role="status">
      <LogoMark size={18} className={styles.spinner} />
      <span>{label ?? t('state.loading')}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = isRotaError(error) ? error.message : t('error.UNKNOWN');
  return (
    <EmptyState
      mascot="dizzy"
      title={t('state.error_title')}
      text={message}
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        ) : null
      }
    />
  );
}

interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  /** Shown instead of children when isEmpty(data) is true. */
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
}

/** Loading, error with retry, empty, or the data. Keeps showing the previous data while a refetch runs. */
export function QueryState<T>({ query, children, empty, isEmpty }: QueryStateProps<T>) {
  if (query.data !== undefined) {
    if (empty !== undefined && isEmpty?.(query.data)) return <>{empty}</>;
    return <>{children(query.data)}</>;
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <Loading />;
}

/** The placeholder of a page that the next phase fills. */
export function Placeholder({ text }: { text?: string }) {
  return <EmptyState mascot="wrench" title={t('state.placeholder_title')} text={text ?? t('state.placeholder_text')} />;
}

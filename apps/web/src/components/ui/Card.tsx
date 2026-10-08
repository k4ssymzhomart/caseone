import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import styles from './ui.module.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding: 'm' 16, 'l' 24, 'none' for tables and charts that pad themselves. Default 'm'. */
  pad?: 'none' | 'm' | 'l';
  children?: ReactNode;
}

/** bgSubtle surface, radius 12, hairline. Pass onClick to make it a hover target. */
export function Card({ pad = 'm', className, children, onClick, ...rest }: CardProps) {
  return (
    <div
      className={[styles.card, className].filter(Boolean).join(' ')}
      data-pad={pad}
      data-interactive={onClick ? true : undefined}
      onClick={onClick}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Responsive grid of cards or tiles; `min` is the narrowest column (default 200 px). */
export function Grid({ min = 200, children }: { min?: number; children?: ReactNode }) {
  return (
    <div className={styles.grid} style={{ '--grid-min': `${min}px` } as CSSProperties}>
      {children}
    </div>
  );
}

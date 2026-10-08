import type { ReactNode } from 'react';
import styles from './ui.module.css';

interface PageProps {
  title: string;
  /** Mono caps line above the title: «ДЕНЬ · С 08:00 ДО 20:00». Pass it as written; CSS uppercases it. */
  eyebrow?: string;
  /** Buttons on the right of the title (exports, primary actions). */
  actions?: ReactNode;
  children?: ReactNode;
}

/** Every page: eyebrow, title, actions, then its sections with 24 px between them. */
export function Page({ title, eyebrow, actions, children }: PageProps) {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageTitles}>
          {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
          <h1 className={styles.pageTitle}>{title}</h1>
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

interface SectionProps {
  title?: string;
  /** Right side of the section header: a count, a link, a small control. */
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Section({ title, aside, children, className }: SectionProps) {
  return (
    <section className={[styles.section, className].filter(Boolean).join(' ')}>
      {title || aside ? (
        <div className={styles.sectionHeader}>
          {title ? <h2 className={styles.sectionTitle}>{title}</h2> : null}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Mono caps eyebrow on its own. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className={styles.eyebrow}>{children}</span>;
}

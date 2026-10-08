// Small presentational pieces of the landing: glow, eyebrow, outlined chapter number, heading lines, ✓ / ✕ icons.
import type { CSSProperties } from 'react';
import s from '../landing.module.css';
import u from './ui.module.css';

interface GlowProps {
  width?: number;
  height?: number;
  /** Opacity of the red center, default 0.3. */
  alpha?: number;
  className?: string;
  style?: CSSProperties;
}

/** A blurred red ellipse, centered on its positioned parent. */
export function Glow({ width = 700, height = 560, alpha, className, style }: GlowProps) {
  const vars = {
    '--glow-w': `${width}px`,
    '--glow-h': `${height}px`,
    ...(alpha != null ? { '--glow-a': String(alpha) } : {}),
    ...style,
  } as CSSProperties;
  return <div className={[u.glow, className].filter(Boolean).join(' ')} style={vars} aria-hidden="true" />;
}

export function Eyebrow({ children, className }: { children: string; className?: string }) {
  return <p className={[s.eyebrow, className].filter(Boolean).join(' ')}>{children}</p>;
}

interface ChapterNumberProps {
  children: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/** The big outlined numeral behind a visual. Decorative. */
export function ChapterNumber({ children, size = 400, className, style }: ChapterNumberProps) {
  return (
    <span
      className={[u.chapterNumber, className].filter(Boolean).join(' ')}
      style={{ '--cn-size': `${size}px`, ...style } as CSSProperties}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/** Heading lines: one line per item on wide screens, joined by a space for screen readers. */
export function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <span key={line}>
          {i > 0 ? (
            <>
              {' '}
              <br />
            </>
          ) : null}
          {line}
        </span>
      ))}
    </>
  );
}

/** A round ✓ (green) or ✕ (red) mark. */
export function CheckIcon({ ok }: { ok: boolean }) {
  return (
    <span className={u.icon} data-ok={ok ? '' : undefined} aria-hidden="true">
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {ok ? <path d="M2.5 6.3 5 8.6l4.6-5.2" /> : <path d="m3 3 6 6M9 3 3 9" />}
      </svg>
    </span>
  );
}

/** A bare ✓ in the current color, for table cells. */
export function Tick({ label }: { label: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" role="img" aria-label={label}>
      <path d="M3 8.4 6.4 11.6 13 4.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

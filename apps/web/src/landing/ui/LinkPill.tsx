// A link from links.ts in the kit Button look. External URLs open in a new tab; an empty URL renders a disabled
// pill «{label} · скоро», never a dead link (docs/LANDING.md §6).
import type { ReactNode } from 'react';
import buttonStyles from '@/components/rota/Button/Button.module.css';
import { content } from '../content';
import u from './ui.module.css';

type Variant = 'primary' | 'secondary' | 'quiet';

interface Props {
  href: string;
  children: string;
  variant?: Variant;
  size?: 'm' | 'l';
  className?: string;
}

function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

export function LinkPill({ href, children, variant = 'primary', size = 'l', className }: Props) {
  const classes = [buttonStyles.button, className].filter(Boolean).join(' ');
  if (!href) {
    return (
      <span className={`${classes} ${u.soon}`} data-variant={variant} data-size={size} aria-disabled="true">
        {children} · {content.soon}
      </span>
    );
  }
  return (
    <a
      className={classes}
      data-variant={variant}
      data-size={size}
      href={href}
      {...(isExternal(href) ? { target: '_blank', rel: 'noopener' } : {})}
    >
      {children}
    </a>
  );
}

/** The same rule for plain text links (footer). */
export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (!href) {
    return (
      <span className={[className, u.soonText].filter(Boolean).join(' ')} aria-disabled="true">
        {children} · {content.soon}
      </span>
    );
  }
  return (
    <a className={className} href={href} {...(isExternal(href) ? { target: '_blank', rel: 'noopener' } : {})}>
      {children}
    </a>
  );
}

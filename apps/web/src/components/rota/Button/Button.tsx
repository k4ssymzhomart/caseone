// Copied from the Rota web kit. App addition: the danger variant (red fill) for confirmed destructive actions.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
type Size = 'm' | 'l';

interface Common {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

type AsButton = Common & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AsLink = Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** Pill button. Pass `href` to render a link that looks the same. */
export function Button(props: AsButton | AsLink) {
  const { variant = 'primary', size = 'm', className, children, ...rest } = props;
  const classes = [styles.button, className].filter(Boolean).join(' ');
  if (typeof rest.href === 'string') {
    const anchor = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a className={classes} data-variant={variant} data-size={size} {...anchor}>
        {children}
      </a>
    );
  }
  const button = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" className={classes} data-variant={variant} data-size={size} {...button}>
      {children}
    </button>
  );
}

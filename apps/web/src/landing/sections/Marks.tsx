// Platform and service marks on the landing: the real logos from @rota/design beside the words that name them.
// Brand colors on the dark canvas ('dark' tone), currentColor inside the white primary button. Sized to the text they
// sit with, 8 px from it. Brand logos are the only icons on the page; import single logos, never the platformLogos map.
import {
  androidLogo,
  appleLogo,
  claudeLogo,
  onecLogo,
  postgresqlLogo,
  supabaseLogo,
  telegramLogo,
  type PlatformLogo as Logo,
} from '@rota/design';
import type { ReactNode } from 'react';
import buttonStyles from '@/components/rota/Button/Button.module.css';
import { PlatformLogo } from '@/components/rota/PlatformLogo';
import { content } from '../content';
import u from '../ui/ui.module.css';
import m from './Marks.module.css';

interface MarkProps {
  logo: Logo;
  /** Pixel size of the square mark. */
  size?: number;
  /** currentColor: inside a filled button, where a brand color would clash. */
  mono?: boolean;
  className?: string;
}

/** Optical size: a mark that fills its whole square (the Windows panes) reads larger than the round or tall ones. */
const OPTICAL: Record<string, number> = { Windows: 0.84 };

/** One decorative mark: the text beside it always names the platform. */
export function Mark({ logo, size = 20, mono = false, className }: MarkProps) {
  const px = Math.round(size * (OPTICAL[logo.title] ?? 1));
  const classes = [m.mark, className].filter(Boolean).join(' ');
  return <PlatformLogo logo={logo} size={px} tone={mono ? 'mono' : 'dark'} className={classes} />;
}

interface WithMarkProps {
  logos: readonly Logo[];
  size?: number;
  mono?: boolean;
  children: ReactNode;
  className?: string;
}

/** Marks led text on one line, centered, 8 px apart. */
export function WithMark({ logos, size = 20, mono, children, className }: WithMarkProps) {
  return (
    <span className={[m.withMark, className].filter(Boolean).join(' ')}>
      <span className={m.marks}>
        {logos.map((logo) => (
          <Mark key={logo.title} logo={logo} size={size} mono={mono} />
        ))}
      </span>
      <span>{children}</span>
    </span>
  );
}

/** Logos a copy line may name inline as {name:Word}; only these are bundled. */
const INLINE = {
  android: androidLogo,
  apple: appleLogo,
  claude: claudeLogo,
  onec: onecLogo,
  postgresql: postgresqlLogo,
  supabase: supabaseLogo,
  telegram: telegramLogo,
} as const satisfies Record<string, Logo>;

const TOKEN = /\{(\w+):([^}]+)\}|\n/g;

/**
 * A copy line with inline marks: «В {postgresql:PostgreSQL} на {supabase:Supabase}» draws each mark, sized in em,
 * right before its word, and the pair never breaks across lines. A newline is a line break on wide screens only.
 */
export function Rich({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [whole, name, word] = match;
    const logo = INLINE[name as keyof typeof INLINE];
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      whole === '\n' ? (
        <span key={match.index}>
          {' '}
          <br className={m.br} />
        </span>
      ) : logo ? (
        <span key={match.index} className={m.inline}>
          <PlatformLogo logo={logo} tone="dark" className={m.inlineMark} />
          {word}
        </span>
      ) : (
        word
      ),
    );
    last = match.index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

interface MarkPillProps {
  href: string;
  children: string;
  /** Marks before the label; none for a link that names no platform. */
  logos?: readonly Logo[];
  variant?: 'primary' | 'secondary';
}

/**
 * The LinkPill of ui/ with marks before the label: white primary pill with ink marks, glass pill with brand colors.
 * An empty URL renders the disabled «{label} · скоро» pill, never a dead link.
 */
export function MarkPill({ href, children, logos = [], variant = 'secondary' }: MarkPillProps) {
  const marks = logos.length ? (
    <span className={m.marks}>
      {logos.map((logo) => (
        <Mark key={logo.title} logo={logo} size={20} mono={variant === 'primary'} />
      ))}
    </span>
  ) : null;
  if (!href) {
    return (
      <span className={`${buttonStyles.button} ${u.soon}`} data-variant={variant} data-size="l" aria-disabled="true">
        {marks}
        {children} · {content.soon}
      </span>
    );
  }
  return (
    <a
      className={buttonStyles.button}
      data-variant={variant}
      data-size="l"
      href={href}
      {...(isExternal(href) ? { target: '_blank', rel: 'noopener' } : {})}
    >
      {marks}
      {children}
    </a>
  );
}

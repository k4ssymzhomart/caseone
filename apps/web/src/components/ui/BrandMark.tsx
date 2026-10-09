// Platform and service marks in the panel: the PlatformLogo of the Rota kit, colored for the current theme. The
// dark canvas gets each mark's onDark color (white for Apple and Anthropic), the light theme the owner's exact brand
// color. Sized to the text beside it (14 to 18 px inline), 8 px from it. Brand logos are the only icons in the panel.
// Import single logos from @rota/design (telegramLogo, claudeLogo…), never the platformLogos map.
import { claudeLogo, type PlatformLogo as Logo } from '@rota/design';
import type { ReactNode } from 'react';
import { useTheme } from '@/lib/theme';
import { PlatformLogo } from '../rota';
import styles from './ui.module.css';

interface BrandMarkProps {
  logo: Logo;
  /** Pixel size of the square mark. */
  size?: number;
  /** currentColor, for a mark inside a filled button where a brand color would clash. */
  mono?: boolean;
  /** Spoken name; omit when the text beside the mark names the brand (the mark is then decorative). */
  title?: string;
}

/** One brand mark in the theme's color. */
export function BrandMark({ logo, size = 16, mono = false, title }: BrandMarkProps) {
  const theme = useTheme();
  const tone = mono ? 'mono' : theme === 'light' ? 'brand' : 'dark';
  return (
    <PlatformLogo logo={logo} size={size} tone={tone} title={title} className={styles.brandMark} />
  );
}

interface WithMarkProps extends BrandMarkProps {
  children: ReactNode;
  /** 'tight' (6 px) inside a small capsule such as a Tag; 8 px everywhere else. */
  gap?: 'tight';
}

/** Text led by a brand mark, both centered on one line; the text truncates when its parent clips. */
export function WithMark({ children, gap, ...mark }: WithMarkProps) {
  return (
    <span className={styles.withMark} data-gap={gap}>
      <BrandMark {...mark} />
      <span className={styles.withMarkText}>{children}</span>
    </span>
  );
}

/** True for the Claude models (claude-sonnet-5-5, claude-haiku-5-5); a local or mock model is not Claude. */
export const isClaudeModel = (model: string | null | undefined): model is string =>
  typeof model === 'string' && /^claude/i.test(model.trim());

/**
 * A line that names the model which wrote a text: the Claude mark beside a claude-* model, plain text for any other
 * model (an on premises model behind the gateway, the mock provider, rules).
 */
export function ModelLabel({
  model,
  size = 14,
  children,
}: {
  model: string | null | undefined;
  size?: number;
  children: ReactNode;
}) {
  if (!isClaudeModel(model)) return <>{children}</>;
  return (
    <WithMark logo={claudeLogo} size={size}>
      {children}
    </WithMark>
  );
}

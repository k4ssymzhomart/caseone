import type { PlatformLogo as Logo } from '@rota/design';

interface Props {
  /** A single logo from @rota/design, e.g. androidLogo (import one at a time so pages ship only what they use). */
  logo: Logo;
  /** Pixel size of the square mark. */
  size?: number;
  /**
   * 'dark' (default): the brand color, white where the brand is near black, for Rota's dark canvas.
   * 'brand': the owner's exact brand color. 'mono': currentColor, to sit inside a button or a line of text.
   * A logo with full color artwork (Chrome, Telegram, Safari) paints it in both colored tones.
   */
  tone?: 'dark' | 'brand' | 'mono';
  /** Spoken name; omit when a visible label already names the platform (the mark is then decorative). */
  title?: string;
  className?: string;
}

/** A platform or service logo (Android, Apple, Telegram, Windows…) as inline SVG, crisp at any size. */
export function PlatformLogo({ logo, size = 20, tone = 'dark', title, className }: Props) {
  const fill = tone === 'mono' ? 'currentColor' : tone === 'brand' ? logo.brand : logo.onDark;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ flex: 'none', display: 'inline-block', verticalAlign: 'middle' }}
    >
      {title ? <title>{title}</title> : null}
      {logo.art && tone !== 'mono'
        ? logo.art.map((part) => <path key={part.d.slice(0, 24)} d={part.d} fill={part.color} fillRule="evenodd" />)
        : logo.paths.map((d) => <path key={d.slice(0, 24)} d={d} fill={fill} fillRule="evenodd" />)}
      {logo.detail?.paths.map((d) => (
        <path key={d.slice(0, 24)} d={d} fill={tone === 'mono' ? 'var(--color-bg-canvas, #000)' : logo.detail!.color} />
      ))}
      {logo.label ? (
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight={700}
          fontSize={11}
          fill={tone === 'mono' ? 'var(--color-bg-canvas, #000)' : logo.label.color}
        >
          {logo.label.text}
        </text>
      ) : null}
    </svg>
  );
}

// Copied from the Rota web kit; the path data comes from @rota/design (packages/design/src/brand/logo.ts).
import { lockupSymbolPath, lockupWordmarkPath, markPath } from '@rota/design';

interface MarkProps {
  size?: number;
  color?: string;
  title?: string;
  className?: string;
}

/** The Rota mark: four petals around a turn. Red by default. */
export function LogoMark({ size = 20, color = 'var(--rota-red-500)', title, className }: MarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path d={markPath} fill={color} />
    </svg>
  );
}

interface LockupProps {
  height?: number;
  /** Wordmark color. The mark stays red. */
  color?: string;
  className?: string;
}

/** Mark and wordmark side by side. */
export function Lockup({ height = 24, color = 'currentColor', className }: LockupProps) {
  return (
    <svg className={className} height={height} width={(height * 165) / 50} viewBox="0 0 165 50" role="img">
      <title>Rota</title>
      <path d={lockupSymbolPath} fill="var(--rota-red-500)" />
      <path d={lockupWordmarkPath} fill={color} fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}

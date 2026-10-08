// Copied from the Rota web kit; the pose data comes from @rota/design (packages/design/src/brand/mascots.ts).
import { mascots, type MascotName } from '@rota/design';
import styles from './Mascot.module.css';

interface Props {
  name: MascotName;
  size?: number;
  /** Describe the mascot when it carries meaning. Leave empty for decoration. */
  title?: string;
  className?: string;
}

/**
 * A brand mascot as inline SVG. Layers take their colors from CSS variables, so the
 * props that are ink in light mode turn white in dark mode, as in the Figma file.
 * Use one per screen, 96 to 160 px, next to a title, only on empty, success, error, waiting and onboarding states.
 */
export function Mascot({ name, size = 120, title, className }: Props) {
  const data = mascots[name];
  return (
    <svg
      className={[styles.mascot, className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 240 240"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <g transform={`translate(${data.dx} ${data.dy})`}>
        {data.layers.map(([role, d], i) => (
          <path key={`${role}${i}`} className={styles[role]} d={d} fillRule="evenodd" clipRule="evenodd" />
        ))}
      </g>
    </svg>
  );
}

export { mascotNames, type MascotName } from '@rota/design';

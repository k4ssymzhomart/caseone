// A real app screenshot in a CSS phone frame (docs/LANDING.md §3.1): radius 0.17 × width outside, 0.145 × width on
// the image, 8 px bezel, deep shadow with a red halo, optional tilt. Width and height are set: no layout shift.
import type { CSSProperties } from 'react';
import { shots, type ShotName } from '../assets/shots';
import u from './ui.module.css';

interface Props {
  shot: ShotName;
  /** Russian description of the screen. */
  alt: string;
  /** CSS px, default 300. */
  width?: number;
  /** CSS px under 768 px wide, default min(width, 240). */
  mobileWidth?: number;
  /** Degrees. */
  tilt?: number;
  /** Above the fold: load at once with high priority. */
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function PhoneShot({ shot, alt, width = 300, mobileWidth, tilt, priority = false, className, style }: Props) {
  const img = shots[shot];
  const vars = {
    '--pw': `${width}px`,
    '--pwm': `${mobileWidth ?? Math.min(width, 240)}px`,
    ...(tilt ? { '--tilt': `${tilt}deg` } : {}),
    ...style,
  } as CSSProperties;
  return (
    <figure className={[u.phone, className].filter(Boolean).join(' ')} style={vars}>
      <img
        src={img.src}
        width={img.width}
        height={img.height}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        {...(priority ? { fetchPriority: 'high' as const } : {})}
      />
    </figure>
  );
}

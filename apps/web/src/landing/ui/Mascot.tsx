// A brand mascot by pose name, as the dark variant SVG file from @rota/design (props drawn white for the black
// canvas). Files instead of the kit's inline <Mascot>: the page needs 12 poses and the inline path data would add
// about 150 KB of JavaScript; as images they load lazily below the fold. Decorative: empty alt.
import check from '@rota/design/assets/mascots/dark/check.svg';
import cheer from '@rota/design/assets/mascots/dark/cheer.svg';
import dizzy from '@rota/design/assets/mascots/dark/dizzy.svg';
import mail from '@rota/design/assets/mascots/dark/mail.svg';
import oops from '@rota/design/assets/mascots/dark/oops.svg';
import peek from '@rota/design/assets/mascots/dark/peek.svg';
import point from '@rota/design/assets/mascots/dark/point.svg';
import read from '@rota/design/assets/mascots/dark/read.svg';
import search from '@rota/design/assets/mascots/dark/search.svg';
import shield from '@rota/design/assets/mascots/dark/shield.svg';
import tired from '@rota/design/assets/mascots/dark/tired.svg';
import wrench from '@rota/design/assets/mascots/dark/wrench.svg';
import s from '../landing.module.css';

const poses = { check, cheer, dizzy, mail, oops, peek, point, read, search, shield, tired, wrench } as const;

export type LandingMascot = keyof typeof poses;

interface Props {
  name: LandingMascot;
  size: number;
  /** Gentle 6 px float (off with reduced motion). */
  float?: boolean;
  className?: string;
}

export function Mascot({ name, size, float = true, className }: Props) {
  return (
    <img
      className={[float ? s.float : '', className].filter(Boolean).join(' ')}
      src={poses[name]}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

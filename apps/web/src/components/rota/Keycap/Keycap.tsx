// Copied from the Rota web kit. Only glyph keys (⇧ ⌘ Esc): Rota never draws letter keycaps.
import styles from './Keycap.module.css';

interface Props {
  label: string;
  size?: 's' | 'm' | 'l';
  pressed?: boolean;
  /** Spoken label, for example "Shift" for ⇧. */
  name?: string;
}

/** A keyboard key. Only glyph keys like ⇧, ⌘ and Esc: Rota never draws letter keycaps. */
export function Keycap({ label, size = 'm', pressed = false, name }: Props) {
  return (
    <kbd className={styles.key} data-size={size} data-pressed={pressed || undefined} aria-label={name}>
      {label}
    </kbd>
  );
}

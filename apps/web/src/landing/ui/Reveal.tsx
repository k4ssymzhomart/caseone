// Fade up on first scroll into view (opacity 0 → 1, translateY 16 → 0, 500 ms, 60 ms stagger by `index`). Once.
// Reduced motion shows the final state at once.
import type { CSSProperties, ElementType, ReactNode } from 'react';
import { useReducedMotion, useSeenOnce } from './motion';
import u from './ui.module.css';

interface Props {
  children: ReactNode;
  /** Position in a group: delays the fade by index × 60 ms. */
  index?: number;
  as?: ElementType;
  className?: string;
  id?: string;
}

export function Reveal({ children, index = 0, as: Tag = 'div', className, id }: Props) {
  const reduced = useReducedMotion();
  const [ref, seen] = useSeenOnce<HTMLElement>(0.15);
  const style = index ? ({ transitionDelay: `${index * 60}ms` } as CSSProperties) : undefined;
  return (
    <Tag
      ref={ref}
      id={id}
      className={[u.reveal, className].filter(Boolean).join(' ')}
      data-shown={seen || reduced ? '' : undefined}
      style={style}
    >
      {children}
    </Tag>
  );
}

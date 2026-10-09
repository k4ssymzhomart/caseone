// Chapter 09 (§5.8): data stays at the plant. Text left, the shield mascot with two floating pills right. Supabase,
// PostgreSQL, Claude and 1С carry their marks where the copy names them.
import { content } from '../content';
import s from '../landing.module.css';
import { ChapterNumber, Eyebrow, Glow, Lines } from '../ui/bits';
import { Mascot } from '../ui/Mascot';
import { Reveal } from '../ui/Reveal';
import d from './Data.module.css';
import { Rich } from './Marks';

const c = content.data;

export function Data() {
  return (
    <section id="ch09" className={`${s.section} ${s.anchor}`} aria-labelledby="ch09-title">
      <div className={`${s.container} ${s.split}`}>
        <Reveal>
          <Eyebrow>{c.eyebrow}</Eyebrow>
          <h2 id="ch09-title" className={`${s.h2} ${s.h2Side}`}>
            <Lines lines={c.title} />
          </h2>
          <p className={s.text}>
            <Rich text={c.text} />
          </p>
          <ul className={s.bullets}>
            {c.bullets.map((b) => (
              <li key={b}>
                <Rich text={b} />
              </li>
            ))}
          </ul>
        </Reveal>
        <div className={`${s.visual} ${d.visual}`}>
          <Glow />
          <ChapterNumber className={d.number}>09</ChapterNumber>
          <Mascot name="shield" size={340} className={d.mascot} />
          {c.pills.map((pill, i) => (
            <span key={pill} className={`${s.pill} ${d.pill}`} data-k={i}>
              <span className={s.dot} data-tone={i === 0 ? 'free' : 'critical'} />
              {pill}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

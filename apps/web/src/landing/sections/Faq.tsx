// FAQ (§5.11): native <details> accordion, the first item open, a plus that turns into a cross. Answers that name a
// platform (Android, iPhone, PostgreSQL, Supabase, 1С) show its mark inline.
import { content } from '../content';
import s from '../landing.module.css';
import { Eyebrow, Lines } from '../ui/bits';
import { Mascot } from '../ui/Mascot';
import { Reveal } from '../ui/Reveal';
import f from './Faq.module.css';
import { Rich } from './Marks';

const c = content.faq;

export function Faq() {
  return (
    <section id="faq" className={`${s.section} ${s.anchor}`} aria-labelledby="faq-title">
      <div className={`${s.container} ${f.wrap}`}>
        <Reveal className={s.center}>
          <Eyebrow>{c.eyebrow}</Eyebrow>
          <h2 id="faq-title" className={s.h2}>
            <Lines lines={c.title} />
          </h2>
        </Reveal>
        <div className={f.list}>
          <Mascot name="point" size={150} className={f.mascot} />
          {c.items.map((item, i) => (
            <details key={item.q} className={f.item} open={i === 0}>
              <summary className={f.question}>
                <span>{item.q}</span>
                <span className={f.icon} aria-hidden="true" />
              </summary>
              <p className={f.answer}>
                <Rich text={item.a} />
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

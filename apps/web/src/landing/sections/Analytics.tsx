// Chapter 08 (§5.7): what the AI found in three months of synthetic history, and the rating weights.
import { content } from '../content';
import s from '../landing.module.css';
import { Eyebrow, Lines } from '../ui/bits';
import { Mascot } from '../ui/Mascot';
import { Reveal } from '../ui/Reveal';
import a from './Analytics.module.css';

const c = content.analytics;

export function Analytics() {
  return (
    <section id="analytics" className={`${s.section} ${s.anchor}`} aria-labelledby="ch08-title">
      <span id="ch08" className={s.anchor} />
      <div className={s.container}>
        <Reveal className={a.head}>
          <div>
            <Eyebrow>{c.eyebrow}</Eyebrow>
            <h2 id="ch08-title" className={`${s.h2} ${s.h2Side}`}>
              <Lines lines={c.title} />
            </h2>
            <p className={s.lead}>{c.lead}</p>
            <p className={`${s.mono} ${a.caption}`}>{c.caption}</p>
          </div>
          <Mascot name="read" size={200} className={a.mascot} />
        </Reveal>

        <ul className={a.grid}>
          {c.cards.map((card, i) => (
            <Reveal as="li" key={card.title} index={i % 3} className={`${s.glass} ${a.card}`}>
              <span className={`${s.mono} ${a.value}`}>{card.value}</span>
              <h3 className={a.title}>{card.title}</h3>
              <p className={a.text}>{card.text}</p>
            </Reveal>
          ))}
        </ul>

        <Reveal className={`${s.glass} ${a.found}`}>
          <p className={`${s.mono} ${a.foundLabel}`}>{c.found.label}</p>
          <p className={a.foundText}>{c.found.text}</p>
        </Reveal>

        <Reveal className={`${s.glass} ${a.rating}`}>
          <p className={`${s.mono} ${a.foundLabel}`}>{c.rating.label}</p>
          <div className={a.ratingRow}>
            <ul className={a.weights}>
              {c.rating.weights.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className={a.ratingNote}>{c.rating.note}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

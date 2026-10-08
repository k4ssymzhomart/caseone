// Chapter 04 (§5.3): the order in three steps on real screens, then the status line.
import { content } from '../content';
import s from '../landing.module.css';
import { ChapterNumber, Eyebrow, Glow, Lines } from '../ui/bits';
import { PhoneShot } from '../ui/PhoneShot';
import { Reveal } from '../ui/Reveal';
import o from './Order.module.css';

const c = content.order;

export function Order() {
  return (
    <section id="how" className={`${s.section} ${s.anchor}`} aria-labelledby="ch04-title">
      <span id="ch04" className={s.anchor} />
      <Glow width={1100} height={700} alpha={0.22} className={o.glow} />
      <div className={s.container}>
        <Reveal className={s.center}>
          <Eyebrow>{c.eyebrow}</Eyebrow>
          <h2 id="ch04-title" className={s.h2}>
            <Lines lines={c.title} />
          </h2>
          <p className={s.lead}>{c.lead}</p>
        </Reveal>

        <ol className={o.steps}>
          {c.steps.map((step, i) => (
            <Reveal as="li" key={step.n} index={i} className={o.step}>
              <ChapterNumber size={320} className={o.numeral}>
                {step.n}
              </ChapterNumber>
              <p className={`${s.eyebrow} ${o.stepEyebrow}`}>{step.eyebrow}</p>
              <PhoneShot shot={step.shot} alt={step.alt} width={260} mobileWidth={240} className={o.phone} />
              <h3 className={o.title}>{step.title}</h3>
              <p className={o.text}>{step.text}</p>
            </Reveal>
          ))}
        </ol>

        <Reveal className={o.flow}>
          <ol className={o.statuses}>
            {/* the arrow travels with the next pill, so a wrapped row starts with «→» instead of ending with it */}
            {c.statuses.map((status, i) => (
              <li key={status.label} className={o.flowItem}>
                {i > 0 ? (
                  <span className={o.arrow} aria-hidden="true">
                    →
                  </span>
                ) : null}
                <span className={`${s.pill} ${o.status}`} data-ai={'ai' in status ? '' : undefined}>
                  <span className={s.dot} data-tone={status.tone} />
                  {status.label}
                </span>
              </li>
            ))}
          </ol>
          <p className={o.caption}>{c.caption}</p>
        </Reveal>
      </div>
    </section>
  );
}

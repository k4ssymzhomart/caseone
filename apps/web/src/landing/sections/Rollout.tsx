// Rollout (§5.10): a road with four stages, the first quarter red. The 1С badge stands beside «1С».
import { content } from '../content';
import s from '../landing.module.css';
import { Eyebrow, Lines } from '../ui/bits';
import { Reveal } from '../ui/Reveal';
import { Rich } from './Marks';
import r from './Rollout.module.css';

const c = content.rollout;

export function Rollout() {
  return (
    <section id="rollout" className={`${s.section} ${s.anchor}`} aria-labelledby="rollout-title">
      <div className={s.container}>
        <Reveal>
          <Eyebrow>{c.eyebrow}</Eyebrow>
          <h2 id="rollout-title" className={`${s.h2} ${s.h2Side}`}>
            <Lines lines={c.title} />
          </h2>
        </Reveal>
        <ol className={r.road}>
          {c.stages.map((stage, i) => (
            <Reveal as="li" key={stage.title} index={i} className={r.stage}>
              <span className={r.dot} data-now={i === 0 ? '' : undefined} aria-hidden="true" />
              <span className={`${s.mono} ${r.label}`} data-now={i === 0 ? '' : undefined}>
                {stage.label}
              </span>
              <h3 className={r.title}>{stage.title}</h3>
              <p className={r.text}>
                <Rich text={stage.text} />
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

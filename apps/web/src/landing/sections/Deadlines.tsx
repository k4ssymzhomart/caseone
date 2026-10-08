// Chapter 06 (§5.5): deadlines. The framed stage holds the watchdog timeline; a push in the case's format sits on
// its lower right corner; text right.
import { LogoMark } from '@/components/rota/Logo/Logo';
import { content } from '../content';
import s from '../landing.module.css';
import { Eyebrow, Lines } from '../ui/bits';
import { Mascot } from '../ui/Mascot';
import { Reveal } from '../ui/Reveal';
import d from './Deadlines.module.css';
import f from './Frame.module.css';

const c = content.deadlines;

export function Deadlines() {
  return (
    <section id="deadlines" className={`${s.section} ${s.anchor}`} aria-labelledby="ch06-title">
      <span id="ch06" className={s.anchor} />
      <div className={`${s.container} ${s.split}`}>
        <Reveal className={`${f.frameWrap} ${d.visual}`}>
          <div className={`${f.frame} ${d.frame}`}>
            <ol className={d.timeline}>
              {c.steps.map((step) => (
                <li key={step.label} data-hot={step.hot ? '' : undefined}>
                  <span className={d.tdot} aria-hidden="true" />
                  <span className={`${s.mono} ${d.label}`}>{step.label}</span>
                  <span className={d.title}>{step.title}</span>
                  {step.text ? <span className={d.text}>{step.text}</span> : null}
                </li>
              ))}
            </ol>
          </div>
          <div className={d.push}>
            <div className={d.pushHead}>
              <span className={d.appIcon} aria-hidden="true">
                <LogoMark size={22} />
              </span>
              <span className={`${s.mono} ${d.app}`}>{c.push.app}</span>
              <span className={d.time}>{c.push.time}</span>
            </div>
            <p className={d.pushTitle}>{c.push.title}</p>
            <p className={d.pushBody}>{c.push.body}</p>
          </div>
          <Mascot name="search" size={170} className={d.search} />
        </Reveal>
        <Reveal index={1}>
          <Eyebrow>{c.eyebrow}</Eyebrow>
          <h2 id="ch06-title" className={`${s.h2} ${s.h2Side}`}>
            <Lines lines={c.title} />
          </h2>
          <p className={s.text}>{c.text}</p>
          <ul className={s.bullets}>
            {c.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

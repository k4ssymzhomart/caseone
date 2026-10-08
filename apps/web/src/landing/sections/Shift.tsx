// Chapter 05 (§5.4): the shift at a glance. Text left, the framed stage with two real screens right, the mascot
// peeking over the bottom edge.
import { content } from '../content';
import s from '../landing.module.css';
import { Eyebrow, Lines } from '../ui/bits';
import { Mascot } from '../ui/Mascot';
import { PhoneShot } from '../ui/PhoneShot';
import { Reveal } from '../ui/Reveal';
import f from './Frame.module.css';

const c = content.shift;

export function Shift() {
  return (
    <section id="ch05" className={`${s.section} ${s.anchor}`} aria-labelledby="ch05-title">
      <div className={`${s.container} ${s.split}`}>
        <Reveal>
          <Eyebrow>{c.eyebrow}</Eyebrow>
          <h2 id="ch05-title" className={`${s.h2} ${s.h2Side}`}>
            <Lines lines={c.title} />
          </h2>
          <p className={s.text}>{c.text}</p>
          <ul className={s.bullets}>
            {c.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Reveal>
        <Reveal index={1} className={f.frameWrap}>
          <div className={`${f.frame} ${f.phones}`}>
            <PhoneShot shot="masterShift" alt={c.altShift} width={230} mobileWidth={150} />
            <PhoneShot shot="masterBoard" alt={c.altBoard} width={230} mobileWidth={150} className={f.lower} />
            <Mascot name="peek" size={180} float={false} className={f.peek} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

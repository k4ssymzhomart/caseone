// The problem (§5.2): chapters 01 to 03 and the К-3 timeline, after the Rota story chapters.
import { useEffect, useState } from 'react';
import { content } from '../content';
import s from '../landing.module.css';
import { ChapterNumber, Eyebrow, Glow, Lines } from '../ui/bits';
import { Mascot } from '../ui/Mascot';
import { useReducedMotion, useSeenOnce } from '../ui/motion';
import { Reveal } from '../ui/Reveal';
import p from './Problem.module.css';

const c = content.problem;

/** «Ахметов, приём!» typed once, letter by letter, when it scrolls into view. */
function Radio() {
  const reduced = useReducedMotion();
  const [ref, seen] = useSeenOnce<HTMLDivElement>(0.4);
  const full = c.ch01.radio.join('\n');
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!seen || reduced) return;
    const timer = window.setInterval(() => {
      setCount((v) => {
        if (v >= full.length) {
          window.clearInterval(timer);
          return v;
        }
        return v + 1;
      });
    }, 70);
    return () => window.clearInterval(timer);
  }, [seen, reduced, full.length]);

  const shown = reduced ? full : full.slice(0, count);
  const lines = shown.split('\n');
  return (
    <div ref={ref} className={p.radio}>
      <p className={s.visuallyHidden}>{c.ch01.radio.join(' ')}</p>
      <p className={p.typed} aria-hidden="true">
        {lines.map((line, i) => (
          <span key={i} className={p.typedLine}>
            {line}
            {i === lines.length - 1 ? <span className={p.caret} /> : null}
          </span>
        ))}
      </p>
      <span className={`${s.pill} ${p.channel}`}>
        <span className={s.dot} data-tone="off" />
        {c.ch01.channel}
      </span>
    </div>
  );
}

function ChapterText({
  id,
  eyebrow,
  title,
  text,
}: {
  id: string;
  eyebrow: string;
  title: readonly string[];
  text: string;
}) {
  return (
    <Reveal className={p.text}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h3 id={`${id}-title`} className={`${s.h2} ${s.h2Side}`}>
        <Lines lines={title} />
      </h3>
      <p className={s.text}>{text}</p>
    </Reveal>
  );
}

export function Problem() {
  return (
    <section id="problem" className={s.section} aria-labelledby="problem-title">
      <div className={s.container}>
        <Reveal className={s.center}>
          <Eyebrow>{c.eyebrow}</Eyebrow>
          <h2 id="problem-title" className={s.h2}>
            <Lines lines={c.title} />
          </h2>
        </Reveal>
        <nav className={p.chapterNav} aria-label={c.chaptersLabel}>
          <ol>
            {c.chapters.map((ch) => (
              <li key={ch.id}>
                <a href={`#${ch.id}`}>
                  <span className={s.mono}>{ch.n}</span> {ch.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* 01 · by radio */}
        <article id="ch01" className={`${s.split} ${p.chapter} ${s.anchor}`} aria-labelledby="ch01-title">
          <ChapterText id="ch01" {...c.ch01} />
          <div className={`${s.visual} ${p.visual}`}>
            <Glow />
            <ChapterNumber className={p.number}>01</ChapterNumber>
            <Radio />
            <Mascot name="mail" size={240} className={p.mail} />
          </div>
        </article>

        {/* 02 · who is free */}
        <article id="ch02" className={`${s.split} ${p.chapter} ${p.reverse} ${s.anchor}`} aria-labelledby="ch02-title">
          <ChapterText id="ch02" {...c.ch02} />
          <div className={`${s.visual} ${p.visual}`}>
            <Glow />
            <ChapterNumber className={p.number}>02</ChapterNumber>
            <Mascot name="tired" size={240} className={p.tired} />
            <ul className={p.calls}>
              {c.ch02.calls.map((call, i) => (
                <Reveal as="li" key={call} index={i + 1} className={p.call}>
                  <span className={s.pill} style={{ opacity: 1 - i * 0.17 }}>
                    <span className={s.dot} data-tone={i === 0 ? 'working' : 'off'} />
                    {call}
                  </span>
                </Reveal>
              ))}
            </ul>
          </div>
        </article>

        {/* 03 · К-3 again */}
        <article id="ch03" className={`${s.split} ${p.chapter} ${s.anchor}`} aria-labelledby="ch03-title">
          <ChapterText id="ch03" {...c.ch03} />
          <div className={`${s.visual} ${p.visual}`}>
            <Glow />
            <ChapterNumber className={p.number}>03</ChapterNumber>
            <div className={p.orbit} aria-hidden="true">
              <div className={p.ring}>
                {[0, 1, 2, 3].map((k) => (
                  <span key={k} className={p.satellite} data-k={k}>
                    <span className={`${s.pill} ${s.mono} ${p.code}`}>{c.ch03.code}</span>
                  </span>
                ))}
              </div>
              <Mascot name="dizzy" size={220} className={p.dizzy} />
            </div>
          </div>
        </article>

        {/* the К-3 timeline */}
        <Reveal className={p.timeline}>
          <ol className={p.track} aria-label={c.timeline.label}>
            {c.timeline.points.map((point) => (
              <li key={point}>
                <span className={p.tdot} />
                <span className={`${s.mono} ${p.when}`}>{point}</span>
                <span className={`${s.mono} ${p.what}`}>
                  <span>{c.timeline.code}</span>
                  <span className={p.sep}> · </span>
                  <span>{c.timeline.fault}</span>
                </span>
              </li>
            ))}
          </ol>
          <span className={p.total}>{c.timeline.total}</span>
          <Mascot name="oops" size={140} className={p.oops} />
        </Reveal>
      </div>
    </section>
  );
}

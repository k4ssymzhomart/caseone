// Chapter 07 (§5.6): the AI review. Six check chips around the mascot, a marquee of verdicts, the score bar.
import type { CSSProperties } from 'react';
import { content } from '../content';
import s from '../landing.module.css';
import { CheckIcon, Eyebrow, Glow, Lines } from '../ui/bits';
import { Mascot } from '../ui/Mascot';
import { Reveal } from '../ui/Reveal';
import r from './Review.module.css';

const c = content.review;
const TILTS = [-4, 3, -2, 4, -3, 2];

function Chip({ ok, text, tag, index }: { ok: boolean; text: string; tag: string; index: number }) {
  return (
    <Reveal as="li" index={index} className={r.chipWrap}>
      <span className={r.chip} style={{ '--tilt': `${TILTS[index] ?? 0}deg` } as CSSProperties}>
        <CheckIcon ok={ok} />
        <span className={r.chipText}>
          <span className={s.visuallyHidden}>{ok ? c.passed : c.failed}: </span>
          {text}
        </span>
        <span className={`${s.mono} ${r.tag}`}>{tag}</span>
      </span>
    </Reveal>
  );
}

export function Review() {
  const left = c.checks.slice(0, 3);
  const right = c.checks.slice(3);
  const pills = c.verdicts.map((v) => (
    <span key={v.text} className={s.pill}>
      <span className={s.dot} data-tone={v.tone} />
      {v.text}
    </span>
  ));
  const rules = c.bar.filter((x) => !x.llm);
  const llm = c.bar.filter((x) => x.llm);

  return (
    <section id="review" className={`${s.section} ${s.anchor}`} aria-labelledby="ch07-title">
      <span id="ch07" className={s.anchor} />
      <div className={s.container}>
        <Reveal className={s.center}>
          <Eyebrow>{c.eyebrow}</Eyebrow>
          <h2 id="ch07-title" className={s.h2}>
            <Lines lines={c.title} />
          </h2>
          <p className={s.lead}>{c.lead}</p>
        </Reveal>

        <div className={r.stage}>
          <Glow width={640} height={520} alpha={0.34} />
          <ul className={`${r.chips} ${r.left}`}>
            {left.map((x, i) => (
              <Chip key={x.tag} {...x} index={i} />
            ))}
          </ul>
          <Mascot name="check" size={300} className={r.mascot} />
          <ul className={`${r.chips} ${r.right}`}>
            {right.map((x, i) => (
              <Chip key={x.tag} {...x} index={i + 3} />
            ))}
          </ul>
        </div>
      </div>

      <div className={r.marquee}>
        <p className={s.visuallyHidden}>
          {c.verdictsLabel}: {c.verdicts.map((v) => v.text).join(', ')}.
        </p>
        {/* four copies, moved by half: seamless on screens up to two runs wide */}
        <div className={r.track} aria-hidden="true">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className={r.run}>
              {pills}
            </div>
          ))}
        </div>
      </div>

      <div className={s.container}>
        <Reveal className={r.score}>
          <div className={r.groups}>
            <span className={`${s.mono} ${r.groupLabel}`} style={{ flexGrow: 65 }}>
              {c.rulesLabel}
            </span>
            <span className={`${s.mono} ${r.groupLabel} ${r.groupLlm}`} style={{ flexGrow: 35 }}>
              {c.llmLabel}
            </span>
          </div>
          <ol className={r.bar}>
            {[...rules, ...llm].map((seg) => (
              <li
                key={seg.code}
                className={r.segment}
                data-llm={seg.llm ? '' : undefined}
                style={{ flexGrow: seg.points }}
              >
                <span className={r.segHead}>
                  <span className={s.mono}>{seg.code}</span>
                  <strong className={s.mono}>{seg.points}</strong>
                </span>
                <span className={r.segLabel}>{seg.label}</span>
              </li>
            ))}
          </ol>
          <p className={r.thresholds}>{c.thresholds}</p>
        </Reveal>
      </div>
    </section>
  );
}

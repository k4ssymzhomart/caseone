// Compare (§5.9): radio and paper against Rota, in a glass table.
import { content } from '../content';
import s from '../landing.module.css';
import { Eyebrow, Lines, Tick } from '../ui/bits';
import { Reveal } from '../ui/Reveal';
import t from './Compare.module.css';

const c = content.compare;

export function Compare() {
  return (
    <section id="compare" className={`${s.section} ${s.anchor}`} aria-labelledby="compare-title">
      <div className={s.container}>
        <Reveal className={s.center}>
          <Eyebrow>{c.eyebrow}</Eyebrow>
          <h2 id="compare-title" className={s.h2}>
            <Lines lines={c.title} />
          </h2>
        </Reveal>
        <Reveal className={`${s.glass} ${t.card}`}>
          <table className={t.table}>
            <caption className={s.visuallyHidden}>{c.caption}</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className={s.visuallyHidden}>{c.feature}</span>
                </th>
                <th scope="col" className={t.old}>
                  {c.old}
                </th>
                <th scope="col" className={t.rota}>
                  <span className={t.rotaBadge}>{c.rota}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className={t.old}>{row.old}</td>
                  <td className={t.rota}>{row.rota === true ? <Tick label={c.yes} /> : row.rota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </div>
    </section>
  );
}

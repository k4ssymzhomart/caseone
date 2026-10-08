// Final CTA, the submission hub (§5.12): every link for the jury and the test accounts.
import { content } from '../content';
import { links } from '../links';
import s from '../landing.module.css';
import { Lines } from '../ui/bits';
import { LinkPill } from '../ui/LinkPill';
import { Mascot } from '../ui/Mascot';
import { PhoneShot } from '../ui/PhoneShot';
import { Reveal } from '../ui/Reveal';
import c_ from './Cta.module.css';

const c = content.cta;

export function Cta() {
  return (
    <section id="try" className={`${s.section} ${s.anchor}`} aria-labelledby="try-title">
      <div className={s.container}>
        <Reveal className={c_.card}>
          <Mascot name="wrench" size={150} className={c_.wrench} />
          <Mascot name="cheer" size={170} className={c_.cheer} />
          <div className={c_.body}>
            <h2 id="try-title" className={s.h2}>
              <Lines lines={c.title} />
            </h2>
            <p className={s.lead}>{c.lead}</p>
            <div className={c_.buttons}>
              <LinkPill href={links.apk}>{c.apk}</LinkPill>
              <LinkPill href={links.panel} variant="secondary">
                {c.panel}
              </LinkPill>
              <LinkPill href={links.video} variant="secondary">
                {c.video}
              </LinkPill>
              <LinkPill href={links.pitch} variant="secondary">
                {c.pitch}
              </LinkPill>
              <LinkPill href={links.repo} variant="secondary">
                {c.repo}
              </LinkPill>
            </div>
            <div className={c_.try}>
              <div className={`${s.glass} ${c_.accounts}`}>
                <p className={`${s.mono} ${c_.accountsLabel}`}>{c.accountsLabel}</p>
                <ul>
                  {c.accounts.map((acc) => (
                    <li key={acc.tab} className={s.mono}>
                      <span className={s.dot} data-tone={acc.tone} />
                      <span className={c_.role}>{acc.role}</span>
                      <span>·</span>
                      <span className={c_.strong}>{acc.tab}</span>
                      <span>·</span>
                      <span>{acc.pin}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <PhoneShot shot="login" alt={c.loginAlt} width={220} className={c_.phone} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

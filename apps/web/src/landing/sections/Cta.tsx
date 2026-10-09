// Final CTA, the submission hub (§5.12): every link for the jury and the test accounts. Each link that names a
// platform carries its mark: Android for the APK, Chrome and Safari for the app in the browser (the label names the
// browser, and the FAQ says iPhone), Windows and Apple for the desktop panel, the PDF badge, GitHub.
import { androidLogo, appleLogo, chromeLogo, githubLogo, pdfLogo, safariLogo, windowsLogo } from '@rota/design';
import { content } from '../content';
import { links } from '../links';
import s from '../landing.module.css';
import { Lines } from '../ui/bits';
import { Mascot } from '../ui/Mascot';
import { PhoneShot } from '../ui/PhoneShot';
import { Reveal } from '../ui/Reveal';
import c_ from './Cta.module.css';
import { MarkPill } from './Marks';

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
              <MarkPill href={links.apk} logos={[androidLogo]} variant="primary">
                {c.apk}
              </MarkPill>
              <MarkPill href={links.app} logos={[chromeLogo, safariLogo]}>
                {c.app}
              </MarkPill>
              <MarkPill href={links.panel} logos={[windowsLogo, appleLogo]}>
                {c.panel}
              </MarkPill>
              <MarkPill href={links.video}>{c.video}</MarkPill>
              <MarkPill href={links.pitch} logos={[pdfLogo]}>
                {c.pitch}
              </MarkPill>
              <MarkPill href={links.repo} logos={[githubLogo]}>
                {c.repo}
              </MarkPill>
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

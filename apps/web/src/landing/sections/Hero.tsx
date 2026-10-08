// Hero (§5.1): the Rota wallpaper, the glass widget with the pitch, and the stage with two real screens and the HUD
// toast looping through issue → accept → AI check.
import { useEffect, useState } from 'react';
import hudStyles from '@/components/rota/Hud/Hud.module.css';
import { LogoMark } from '@/components/rota/Logo/Logo';
import wallpaper from '../assets/wallpaper.webp';
import { content } from '../content';
import { links } from '../links';
import s from '../landing.module.css';
import { Lines } from '../ui/bits';
import { LinkPill } from '../ui/LinkPill';
import { useReducedMotion } from '../ui/motion';
import { PhoneShot } from '../ui/PhoneShot';
import h from './Hero.module.css';

const c = content.hero;
const STEP_MS = 2400;

/** The HUD capsule cycling through three states; pauses while the tab is hidden; reduced motion shows the last. */
function HudLoop() {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let timer: number | undefined;
    const start = () => {
      window.clearInterval(timer);
      if (!document.hidden) timer = window.setInterval(() => setI((v) => (v + 1) % c.hud.length), STEP_MS);
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', start);
    };
  }, [reduced]);

  const state = c.hud[reduced ? c.hud.length - 1 : i]!;
  return (
    <div className={h.hudWrap} aria-hidden="true">
      <div key={state.text} className={`${hudStyles.hud} ${h.hud}`}>
        {state.tone === 'mark' ? <LogoMark size={14} /> : <span className={s.dot} data-tone={state.tone} />}
        <span>{state.text}</span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section id="top" className={h.hero} aria-labelledby="hero-title">
      <div className={h.wallpaper} style={{ backgroundImage: `url(${wallpaper})` }} aria-hidden="true" />
      <div className={`${s.container} ${h.grid}`}>
        <div className={h.widget}>
          <div className={h.brand}>
            <LogoMark size={20} />
            <span>{c.brand}</span>
          </div>
          <p className={`${s.eyebrow} ${h.eyebrow}`}>{c.eyebrow}</p>
          <h1 id="hero-title" className={h.title}>
            <Lines lines={c.title} />
          </h1>
          <p className={h.lead}>{c.lead}</p>
          <div className={h.cta}>
            <LinkPill href={links.apk}>{c.apk}</LinkPill>
            <LinkPill href={links.panel} variant="secondary">
              {c.panel}
            </LinkPill>
          </div>
          <p className={h.note}>{c.note}</p>
        </div>

        <div className={h.stage}>
          <PhoneShot
            shot="emergency"
            alt={c.shotEmergency}
            width={280}
            mobileWidth={176}
            tilt={6}
            priority
            className={h.back}
          />
          <PhoneShot shot="masterShift" alt={c.shotMaster} width={300} mobileWidth={196} priority className={h.front} />
          <HudLoop />
          <p className={s.visuallyHidden}>{c.hud.map((x) => x.text).join('. ')}.</p>
        </div>
      </div>

      <ul className={`${s.container} ${h.stats}`}>
        {c.stats.map((text) => (
          <li key={text} className={s.pill}>
            <span className={s.dot} />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}

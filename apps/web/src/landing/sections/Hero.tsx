// Hero (§5.1) as a close up product shot: a 4K silk backdrop (tools/gen-hero-bg.ts), the pitch set editorially on
// the left, and on the right one large phone drawn by us (DeviceFrame) with the real emergency screen, turned toward
// the copy, set on a dark pool in the silk and rising from the hero's bottom edge. The HUD toast loops issue → accept
// → AI check on the screen itself, in its plane. Platform marks as in the final CTA: Android on the APK, Chrome and
// Safari on the browser app, and a «Работает на» row of app icon tiles (Android, iPhone, Windows and Mac, Telegram).
import {
  androidLogo,
  appleLogo,
  chromeLogo,
  safariLogo,
  telegramLogo,
  windowsLogo,
  type PlatformLogo as Logo,
} from '@rota/design';
import { useEffect, useState } from 'react';
import hudStyles from '@/components/rota/Hud/Hud.module.css';
import { LogoMark } from '@/components/rota/Logo/Logo';
import { deviceScreens } from '../assets/deviceScreens';
import { content } from '../content';
import { HERO_SCREEN_SIZES } from '../heroMedia';
import { links } from '../links';
import s from '../landing.module.css';
import { DeviceFrame } from '../ui/DeviceFrame';
import { useReducedMotion } from '../ui/motion';
import h from './Hero.module.css';
import { Mark, MarkPill } from './Marks';

const c = content.hero;
const STEP_MS = 2400;

const PLATFORM_LOGOS: Record<(typeof c.platforms)[number]['id'], readonly Logo[]> = {
  android: [androidLogo],
  iphone: [appleLogo],
  desktop: [windowsLogo, appleLogo],
  telegram: [telegramLogo],
};

/**
 * The HUD capsule cycling through three states; pauses while the tab is hidden; reduced motion shows the last. A
 * message with a line break is a two line notification: the title, then a quieter detail line.
 */
function HudLoop() {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let timer: number | undefined;
    const start = () => {
      window.clearInterval(timer);
      if (!document.hidden)
        timer = window.setInterval(() => setI((v) => (v + 1) % c.hud.length), STEP_MS);
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', start);
    };
  }, [reduced]);

  const state = c.hud[reduced ? c.hud.length - 1 : i]!;
  const [title, detail] = state.text.split('\n');
  return (
    <div className={h.hudWrap} aria-hidden="true">
      <div key={state.text} className={`${hudStyles.hud} ${h.hud}`}>
        {state.tone === 'mark' ? (
          <LogoMark size={15} />
        ) : (
          <span className={s.dot} data-tone={state.tone} />
        )}
        <span className={h.hudText}>
          <span>{title}</span>
          {detail && <span className={hudStyles.muted}>{detail}</span>}
        </span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section id="top" className={h.hero} aria-labelledby="hero-title">
      <div className={h.backdrop} aria-hidden="true" />
      <div className={`${s.container} ${h.grid}`}>
        <div className={h.copy}>
          <h1 id="hero-title" className={h.title}>
            <span className={h.line}>{c.title[0]}</span>
            <span className={h.line}>{c.title[1]}</span>
          </h1>
          <p className={h.lead}>{c.lead}</p>
          <div className={h.cta}>
            <MarkPill href={links.apk} logos={[androidLogo]} variant="primary">
              {c.apk}
            </MarkPill>
            <MarkPill href={links.app} logos={[chromeLogo, safariLogo]}>
              {c.app}
            </MarkPill>
            <MarkPill href={links.panel} variant="quiet" className={h.panelLink}>
              {c.panel}
            </MarkPill>
          </div>
        </div>

        <div className={h.platforms}>
          <p className={h.platformsLabel}>{c.platformsLabel}</p>
          <ul>
            {c.platforms.map((p) => (
              <li key={p.id}>
                <span className={h.platformMarks}>
                  {PLATFORM_LOGOS[p.id].map((logo) => (
                    <Mark key={logo.title} logo={logo} size={22} />
                  ))}
                </span>
                <span className={h.platformText}>
                  <span className={h.platformName}>{p.name}</span>
                  <span className={h.platformNote}>{p.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <ul className={h.stats}>
          {c.stats.map((x) => (
            <li key={x.value}>
              <b>{x.value}</b>
              <span>{x.label}</span>
            </li>
          ))}
        </ul>

        <div className={h.stage}>
          <div className={h.bloom} aria-hidden="true" />
          <div className={h.shot}>
            <DeviceFrame
              src={deviceScreens.emergency}
              alt={c.shotEmergency}
              width="var(--hero-phone)"
              sizes={HERO_SCREEN_SIZES}
              tilt={{ x: 4, y: -16, z: 1.5, perspective: 2200 }}
              shadow="float"
              priority
            >
              <HudLoop />
            </DeviceFrame>
          </div>
          <p className={s.visuallyHidden}>
            {c.hud.map((x) => x.text.replace(/\n/g, ' ').replace(/[.\s]+$/, '')).join('. ')}.
          </p>
        </div>
      </div>
    </section>
  );
}

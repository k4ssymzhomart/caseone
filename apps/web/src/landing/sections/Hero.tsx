// Hero (§5.1) as a light stage above the black page, after the user's reference: the satin backdrop with the red
// ribbon (tools/gen-hero-bg-light.ts), everything centered top to bottom: the app icon tile, a «Новое» pill to the
// AI review, the headline, a two line lead and two buttons with their platform marks; then one upright phone with
// the master's light «Смена» screen, cut by the panel's rounded bottom edge, and four floating cards around it with
// real figures. The cards are decorative; their content is repeated once as text.
import { androidLogo, chromeLogo, claudeLogo, markPath, safariLogo } from '@rota/design';
import checkMascot from '@rota/design/assets/mascots/check.svg';
import { PlatformLogo } from '@/components/rota/PlatformLogo';
import { deviceScreens } from '../assets/deviceScreens';
import { content } from '../content';
import { HERO_SCREEN_SIZES } from '../heroMedia';
import { links } from '../links';
import s from '../landing.module.css';
import { DeviceFrame } from '../ui/DeviceFrame';
import { squircle } from '../ui/deviceModel';
import h from './Hero.module.css';
import { MarkPill } from './Marks';

const c = content.hero;
const k = c.cards;

/** The app icon's continuous corners (iOS proportions: radius 22.4 % of the side). */
const TILE = squircle(0, 0, 100, 100, 22.4);

/** The Rota app icon, drawn: the black tile of packages/design/assets/app-icon with the red mark, crisp at any size. */
function AppIcon() {
  return (
    <svg className={h.icon} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="hero-icon-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={h.iconTop} />
          <stop offset="1" className={h.iconBottom} />
        </linearGradient>
      </defs>
      <path d={TILE} fill="url(#hero-icon-fill)" />
      <path d={TILE} className={h.iconEdge} />
      <path d={markPath} className={h.iconMark} transform="translate(21.5 21.5) scale(0.57)" />
    </svg>
  );
}

/** Four cards around the phone, each in its own slow drift. */
function Cards() {
  return (
    <div className={h.cards} aria-hidden="true">
      <div className={`${h.card} ${h.review}`}>
        <span className={h.reviewTile}>
          <img
            src={checkMascot}
            width={72}
            height={72}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </span>
        <span className={h.reviewBody}>
          <span className={h.reviewTitle}>{k.review.title}</span>
          <span className={h.bar}>
            <span style={{ width: `${k.review.score}%` }} />
          </span>
          <span className={h.reviewFoot}>
            <span className={h.mint}>
              <span className={s.dot} data-tone="free" />
              {k.review.verdict}
            </span>
            <span className={h.score}>
              <b>{k.review.score}</b> {k.review.total}
            </span>
          </span>
        </span>
      </div>

      <div className={`${h.card} ${h.emergency}`}>
        <span className={h.cardTitle}>{k.emergency.title}</span>
        <span className={h.cardNote}>{k.emergency.note}</span>
        <span className={h.darkPill}>
          <span className={`${s.dot} ${h.pulse}`} data-tone="critical" />
          <b>{k.emergency.value}</b>
          <span>{k.emergency.label}</span>
        </span>
      </div>

      <div className={`${h.card} ${h.repeats}`}>
        <span className={h.cardTitle}>{k.repeats.title}</span>
        <span className={h.cardNote}>{k.repeats.note}</span>
        <span className={h.redPill}>{k.repeats.value}</span>
      </div>

      <div className={`${h.card} ${h.worker}`}>
        <span className={h.initials}>{k.worker.initials}</span>
        <span className={h.workerText}>
          <span className={h.workerName}>{k.worker.name}</span>
          <span className={`${h.cardNote} ${h.status}`}>
            <span className={s.dot} data-tone="working" />
            {k.worker.status} · {k.worker.unit}
          </span>
        </span>
        <span className={h.amount}>{k.worker.time}</span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section id="top" className={h.hero} data-theme="light" aria-labelledby="hero-title">
      <div className={h.backdrop} aria-hidden="true" />
      <div className={`${s.container} ${h.inner}`}>
        <AppIcon />
        <a className={h.badge} href="#review">
          <PlatformLogo logo={claudeLogo} size={16} tone="brand" />
          <span>
            <span className={h.badgeLead}>{c.badgeLead} </span>
            <span className={h.badgeFull}>{c.badge}</span>
            <span className={h.badgeShort}>{c.badgeShort}</span>
          </span>
          <span className={h.badgeArrow} aria-hidden="true">
            →
          </span>
        </a>
        <h1 id="hero-title" className={h.title}>
          <span className={h.line}>{c.title[0]}</span>
          <span className={h.line}>{c.title[1]}</span>
        </h1>
        <p className={h.lead}>{c.lead}</p>
        <div className={h.cta}>
          <MarkPill href={links.apk} logos={[androidLogo]} variant="primary" className={h.primary}>
            {c.apk}
          </MarkPill>
          <MarkPill href={links.app} logos={[chromeLogo, safariLogo]} className={h.secondary}>
            {c.app}
          </MarkPill>
        </div>

        <div className={h.stage}>
          <Cards />
          <p className={s.visuallyHidden}>{c.cardsText}</p>
          <div className={h.phone}>
            <DeviceFrame
              src={deviceScreens.masterShiftLight}
              alt={c.shot}
              width="var(--hero-phone)"
              sizes={HERO_SCREEN_SIZES}
              finish="black"
              rimLight={false}
              shadow="soft"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}

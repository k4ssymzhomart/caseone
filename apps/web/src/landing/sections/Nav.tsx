// Sticky nav (§5.0): frosted white over the light hero, like the reference's white bar, and dark glass once the hero
// has scrolled out from under it. One IntersectionObserver decides (the hero against the page below the nav), no
// scroll handler. The header carries data-theme, so the kit's buttons and the Lockup's wordmark follow it and the
// colors cross fade. Under 1024 px: lockup, APK and a menu button that opens a full screen sheet with the links
// (always dark). Every APK link carries the Android mark.
import { androidLogo } from '@rota/design';
import { useEffect, useState } from 'react';
import { Lockup } from '@/components/rota/Logo/Logo';
import { content } from '../content';
import { links } from '../links';
import { LinkPill } from '../ui/LinkPill';
import { MarkPill } from './Marks';
import n from './Nav.module.css';

const c = content.nav;
const NAV_HEIGHT = 64;

export function Nav() {
  const [onHero, setOnHero] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const hero = document.getElementById('top');
    if (!hero || typeof IntersectionObserver === 'undefined') return;
    // Light while any of the hero is still below the nav's bottom edge.
    const io = new IntersectionObserver(([e]) => setOnHero(e!.isIntersecting), {
      rootMargin: `-${NAV_HEIGHT}px 0px 0px 0px`,
    });
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const light = onHero && !open;

  return (
    <header className={n.nav} data-theme={light ? 'light' : 'dark'} data-open={open || undefined}>
      <div className={n.inner}>
        <a className={n.brand} href="#top" aria-label={c.home}>
          <Lockup height={22} color="var(--color-text-heading)" />
        </a>
        <nav className={n.links} aria-label={c.label}>
          {c.links.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className={n.actions}>
          <LinkPill
            href={links.panel}
            variant="secondary"
            size="m"
            className={`${n.wide} ${n.panel}`}
          >
            {c.panel}
          </LinkPill>
          <MarkPill
            href={links.apk}
            logos={[androidLogo]}
            variant="primary"
            size="m"
            className={n.wide}
          >
            {c.apk}
          </MarkPill>
          <MarkPill
            href={links.apk}
            logos={[androidLogo]}
            variant="primary"
            size="m"
            className={n.narrow}
          >
            {c.apkShort}
          </MarkPill>
          <button
            type="button"
            className={n.menuButton}
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? c.close : c.menu}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={n.burger} data-open={open ? '' : undefined} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div id="landing-menu" className={n.sheet} hidden={!open}>
        <nav aria-label={c.label}>
          {c.links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className={n.sheetActions}>
          <MarkPill href={links.apk} logos={[androidLogo]} variant="primary">
            {c.apk}
          </MarkPill>
          <LinkPill href={links.panel} variant="secondary">
            {c.panel}
          </LinkPill>
        </div>
      </div>
    </header>
  );
}

// Sticky nav (§5.0): white over the light hero, like the reference's white bar, and dark glass once the hero
// has scrolled out from under it. One IntersectionObserver decides (the hero against the page below the nav), no
// scroll handler. The header carries data-theme, so the kit's buttons and the Lockup's wordmark follow it and the
// colors cross fade. Under 1024 px: lockup, APK and a menu button that opens a full screen sheet with the links
// (always dark). Every APK link carries the Android mark.
import { androidLogo } from '@rota/design';
import { useEffect, useLayoutEffect, useState } from 'react';
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
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  // Before the first paint: honor a #section link (the landing renders after the load event, so the browser's own
  // jump found nothing), then read where the hero is, so a page opened mid way starts dark. Colors cross fade only
  // from the third frame on. Light while any of the hero is still below the nav's bottom edge.
  useLayoutEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
    const hero = document.getElementById('top');
    if (!hero) return;
    setOnHero(hero.getBoundingClientRect().bottom > NAV_HEIGHT);
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setReady(true));
    });
    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => setOnHero(entries[entries.length - 1]!.isIntersecting),
            {
              rootMargin: `-${NAV_HEIGHT}px 0px 0px 0px`,
            },
          );
    io?.observe(hero);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, []);

  const light = onHero && !open;

  // The browser's bar follows the nav: the hero's canvas over the light panel, black over the page.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const prev = meta.content;
    const css = getComputedStyle(document.documentElement);
    meta.content = css.getPropertyValue(light ? '--rota-gray-50' : '--rota-black').trim() || prev;
    return () => {
      meta.content = prev;
    };
  }, [light]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // The sheet exists under 1024 px only: a tablet turned to landscape closes it, or the page stays locked.
    const wide = window.matchMedia('(min-width: 1024px)');
    const onWide = () => {
      if (wide.matches) setOpen(false);
    };
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    wide.addEventListener('change', onWide);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', onWide);
    };
  }, [open]);

  return (
    <header
      className={n.nav}
      data-theme={light ? 'light' : 'dark'}
      data-open={open || undefined}
      data-ready={ready || undefined}
    >
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

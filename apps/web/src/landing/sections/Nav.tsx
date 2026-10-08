// Sticky nav (§5.0): transparent over the hero, glass after 40 px of scroll. Under 1024 px: lockup, APK and a menu
// button that opens a full screen sheet with the links.
import { useEffect, useState } from 'react';
import { Lockup } from '@/components/rota/Logo/Logo';
import { content } from '../content';
import { links } from '../links';
import { LinkPill } from '../ui/LinkPill';
import n from './Nav.module.css';

const c = content.nav;

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
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

  return (
    <header className={n.nav} data-scrolled={scrolled || open ? '' : undefined}>
      <div className={n.inner}>
        <a className={n.brand} href="#top" aria-label={c.home}>
          <Lockup height={22} color="var(--rota-white)" />
        </a>
        <nav className={n.links} aria-label={c.label}>
          {c.links.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className={n.actions}>
          <LinkPill href={links.panel} variant="secondary" size="m" className={n.wide}>
            {c.panel}
          </LinkPill>
          <LinkPill href={links.apk} size="m" className={n.wide}>
            {c.apk}
          </LinkPill>
          <LinkPill href={links.apk} size="m" className={n.narrow}>
            {c.apkShort}
          </LinkPill>
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
          <LinkPill href={links.apk}>{c.apk}</LinkPill>
          <LinkPill href={links.panel} variant="secondary">
            {c.panel}
          </LinkPill>
        </div>
      </div>
    </header>
  );
}

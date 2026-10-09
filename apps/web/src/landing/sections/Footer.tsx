// Footer (§5.13): lockup and slogan, three columns, the disclaimer. The jury links carry their platform marks in a
// fixed 16 px slot, so every label starts on the same line whether it has a mark or not.
import { androidLogo, appleLogo, githubLogo, pdfLogo, windowsLogo, type PlatformLogo as Logo } from '@rota/design';
import { Lockup } from '@/components/rota/Logo/Logo';
import { content } from '../content';
import { links } from '../links';
import s from '../landing.module.css';
import { TextLink } from '../ui/LinkPill';
import f from './Footer.module.css';
import { Mark } from './Marks';

const c = content.footer;

export function Footer() {
  const jury: { href: string; label: string; logo?: Logo }[] = [
    { href: links.apk, label: c.jury.apk, logo: androidLogo },
    { href: links.app, label: c.jury.app, logo: appleLogo },
    { href: links.panel, label: c.jury.panel, logo: windowsLogo },
    { href: links.video, label: c.jury.video },
    { href: links.pitch, label: c.jury.pitch, logo: pdfLogo },
    { href: links.repo, label: c.jury.repo, logo: githubLogo },
  ];
  return (
    <footer className={f.footer}>
      <div className={`${s.container} ${f.top}`}>
        <div className={f.brand}>
          <Lockup height={26} color="var(--rota-white)" />
          <p>{c.slogan}</p>
        </div>
        <nav className={f.columns} aria-label={c.product.title}>
          <div>
            <p className={`${s.mono} ${f.head}`}>{c.product.title}</p>
            <ul>
              {c.product.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className={`${s.mono} ${f.head}`}>{c.jury.title}</p>
            <ul>
              {jury.map((l) => (
                <li key={l.label} className={f.marked} data-soon={l.href ? undefined : ''}>
                  <span className={f.slot}>{l.logo ? <Mark logo={l.logo} size={16} /> : null}</span>
                  <TextLink href={l.href}>{l.label}</TextLink>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className={`${s.mono} ${f.head}`}>{c.case.title}</p>
            <ul>
              {c.case.items.map((item) => (
                <li key={item} className={f.plain}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
      <div className={`${s.container} ${f.bottom}`}>
        <span>{c.copyright}</span>
        <span>{c.disclaimer}</span>
      </div>
    </footer>
  );
}

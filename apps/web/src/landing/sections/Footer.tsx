// Footer (§5.13): lockup and slogan, three columns, the disclaimer.
import { Lockup } from '@/components/rota/Logo/Logo';
import { content } from '../content';
import { links } from '../links';
import s from '../landing.module.css';
import { TextLink } from '../ui/LinkPill';
import f from './Footer.module.css';

const c = content.footer;

export function Footer() {
  const jury = [
    { href: links.apk, label: c.jury.apk },
    { href: links.panel, label: c.jury.panel },
    { href: links.video, label: c.jury.video },
    { href: links.pitch, label: c.jury.pitch },
    { href: links.repo, label: c.jury.repo },
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
                <li key={l.label}>
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

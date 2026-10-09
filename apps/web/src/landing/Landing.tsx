// The public page at `/` (docs/LANDING.md): the product in the Rota landing style and the submission hub for the
// jury. Dark, with one light panel for the hero; static: no API calls, no cookies, no analytics. Copy in content.ts,
// URLs in links.ts.
import { useLayoutEffect } from 'react';
import { content } from './content';
import s from './landing.module.css';
import { Analytics } from './sections/Analytics';
import { Compare } from './sections/Compare';
import { Cta } from './sections/Cta';
import { Data } from './sections/Data';
import { Deadlines } from './sections/Deadlines';
import { Faq } from './sections/Faq';
import { Footer } from './sections/Footer';
import { Hero } from './sections/Hero';
import { Nav } from './sections/Nav';
import { Order } from './sections/Order';
import { Problem } from './sections/Problem';
import { Review } from './sections/Review';
import { Rollout } from './sections/Rollout';
import { Shift } from './sections/Shift';

export function Landing() {
  // Dark only, whatever theme the panel remembers; the panel's choice comes back when the page unmounts.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const prev = html.dataset.theme;
    html.dataset.theme = 'dark';
    return () => {
      if (prev) html.dataset.theme = prev;
    };
  }, []);

  return (
    <div className={s.root} data-theme="dark">
      <a className={s.skip} href="#main">
        {content.meta.skip}
      </a>
      <Nav />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Problem />
        <Order />
        <Shift />
        <Deadlines />
        <Review />
        <Analytics />
        <Data />
        <Compare />
        <Rollout />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}

export default Landing;

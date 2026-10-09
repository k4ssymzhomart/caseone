// Scripted takes of the web panel for the film (public/footage/s10…s13-*-web.mp4), 1920 × 1080 at 30 fps.
// Every output frame is set (scroll, pointer, typed text), painted and captured, so motion is smooth whatever the
// capture speed: the page is 1440 × 810 CSS px at device scale 2 and each frame is downscaled to 1920 × 1080.
// CSS animations can be slowed by the same factor (Animation.setPlaybackRate) so hover transitions keep their real
// duration. Waits for the network happen off camera (the clip cuts there). The pointer and its click ring are drawn
// by the script (a headless page has no cursor); the rest is the page as rendered.
//
//   cd apps/web && npx vite --port 5288 --strictPort      (VITE_API_MODE=supabase in apps/web/.env.local)
//   node video/scripts/web-takes/take-rating.mjs [out.mp4]
//
// A rolling period («Месяц») is pinned to the minute the take starts (a page clock that runs at 2%), so the report
// does not refetch and dim mid take. take-shift.mjs pins the clock to the end of a shift instead (see there).
import { clip, easeInOut, launch, lerp, session, sleep, STORAGE_KEY } from "./cdp.mjs";

export const BASE = "http://localhost:5288";
const FPS = 30;

const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30"><path d="M2 1.5 L2 24.5 L7.6 19.3 L11.4 28 L15.2 26.3 L11.5 17.8 L19 17.8 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

export async function startTake(name, { width = 1440, height = 810, scale = 2, account, clock = null, matchAnimations = true } = {}) {
  const b = await launch({ width, height, scale });
  if (clock) {
    // Fixed page clock (see the shift report take): Date starts at clock.t0 and runs at clock.rate.
    await b.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const RealDate = Date; const realNow = RealDate.now.bind(RealDate);
        const T0 = ${clock.t0}, R0 = realNow(), RATE = ${clock.rate ?? 0.05};
        const fakeNow = () => Math.floor(T0 + (realNow() - R0) * RATE);
        class FakeDate extends RealDate {
          constructor(...a) { if (a.length === 0) super(fakeNow()); else super(...a); }
          static now() { return fakeNow(); }
        }
        globalThis.Date = FakeDate;
      })();`,
    });
  }
  await b.send("Animation.enable");
  await b.navigate(`${BASE}/login`);
  await sleep(1200);
  if (account) {
    const s = await session(account[0], account[1]);
    await b.evaluate(
      `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(s))}); localStorage.setItem('rota.theme','dark'); true`,
    );
  }
  const c = clip(name, { fps: FPS });
  const state = { x: width * 0.62, y: height * 0.55, cursor: false, ripple: null, frameMs: [], flagged: [] };
  let rate = 1;

  const ensureOverlay = () =>
    b.evaluate(`(() => {
      if (!document.getElementById('__film_cursor')) {
        const d = document.createElement('div');
        d.id = '__film_cursor';
        d.innerHTML = ${JSON.stringify(CURSOR_SVG)};
        d.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:30px;z-index:2147483647;pointer-events:none;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));display:none';
        document.documentElement.appendChild(d);
        const r = document.createElement('div');
        r.id = '__film_ripple';
        r.style.cssText = 'position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;z-index:2147483646;pointer-events:none;border:2px solid rgba(255,255,255,.9);background:rgba(255,255,255,.18);display:none';
        document.documentElement.appendChild(r);
      }
      return true;
    })()`);

  const applyOverlay = () => {
    const { x, y, cursor, ripple } = state;
    let rs = "display:none";
    if (ripple) {
      const p = ripple.k / ripple.n;
      rs = `display:block;transform:translate(${ripple.x}px,${ripple.y}px) scale(${0.35 + p * 0.85});opacity:${(1 - p) * 0.85}`;
    }
    return b.evaluate(`(() => {
      const d = document.getElementById('__film_cursor'); const r = document.getElementById('__film_ripple');
      if (!d) return false;
      d.style.display = ${cursor ? "'block'" : "'none'"};
      d.style.transform = 'translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)';
      const rs = ${JSON.stringify(rs)};
      for (const part of rs.split(';')) { const [k, v] = part.split(':'); if (k) r.style[k] = v; }
      const vis = (e) => { const b = e.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight && b.width > 0; };
      const spin = [...document.querySelectorAll('[class*="spinner"], [class*="loading"]')].filter(vis).length;
      const stale = [...document.querySelectorAll('[data-stale]')].filter(vis).length;
      const err = /Не удалось|Ошибка загрузки|Что-то пошло не так/.test(document.querySelector('main')?.textContent ?? '');
      return { spin, stale, err };
    })()`);
  };

  const t = {
    b,
    clip: c,
    state,
    async goto(path) {
      await b.navigate(`${BASE}${path}`);
    },
    async ready(expression, opts) {
      await b.waitFor(expression, opts);
      await b.evaluate("document.fonts.ready.then(() => true)");
      await ensureOverlay();
    },
    /** One frame of the clip at the current state. */
    async frame() {
      const t0 = Date.now();
      if (state.ripple) {
        state.ripple.k++;
        if (state.ripple.k > state.ripple.n) state.ripple = null;
      }
      const flags = await applyOverlay();
      if (flags && (flags.spin || flags.stale || flags.err)) state.flagged.push([c.frames, flags]);
      await b.paint();
      c.add(await b.shot(94));
      const ms = Date.now() - t0;
      state.frameMs.push(ms);
      if (matchAnimations && state.frameMs.length % 20 === 0) {
        const recent = state.frameMs.slice(-20);
        const avg = recent.reduce((a, v) => a + v, 0) / recent.length;
        const next = Math.max(0.08, Math.min(1, 1000 / FPS / avg));
        if (Math.abs(next - rate) > 0.03) {
          rate = next;
          await b.send("Animation.setPlaybackRate", { playbackRate: rate });
        }
      }
    },
    async calibrate() {
      // a few throwaway shots to set the animation rate before the first frame
      const t0 = Date.now();
      for (let i = 0; i < 6; i++) {
        await b.paint();
        await b.shot(94);
      }
      const avg = (Date.now() - t0) / 6;
      if (!matchAnimations) return { avg, rate: 1 };
      rate = Math.max(0.08, Math.min(1, 1000 / FPS / avg));
      await b.send("Animation.setPlaybackRate", { playbackRate: rate });
      return { avg, rate };
    },
    async realtime() {
      rate = 1;
      await b.send("Animation.setPlaybackRate", { playbackRate: 1 });
    },
    async hold(sec) {
      const n = Math.round(sec * FPS);
      for (let i = 0; i < n; i++) await t.frame();
    },
    scrollY: () => b.evaluate("window.scrollY"),
    async scrollTo(y, sec, ease = easeInOut) {
      const from = await t.scrollY();
      const max = await b.evaluate("document.scrollingElement.scrollHeight - innerHeight");
      const to = Math.max(0, Math.min(max, y));
      const n = Math.max(1, Math.round(sec * FPS));
      for (let i = 1; i <= n; i++) {
        const yy = lerp(from, to, ease(i / n));
        await b.evaluate(`window.scrollTo({ top: ${yy.toFixed(2)}, behavior: 'instant' }), true`);
        // the pointer stays put on screen while the page moves under it: tell the page so hover follows
        if (state.cursor) await b.mouse("mouseMoved", state.x, state.y);
        await t.frame();
      }
    },
    /** Scrolls the page and moves the pointer at the same time (the pointer follows a column, for example). */
    async scrollAndMove(y, x2, y2, sec, ease = easeInOut) {
      const from = await t.scrollY();
      const max = await b.evaluate("document.scrollingElement.scrollHeight - innerHeight");
      const to = Math.max(0, Math.min(max, y));
      const fx = state.x;
      const fy = state.y;
      const n = Math.max(1, Math.round(sec * FPS));
      for (let i = 1; i <= n; i++) {
        const p = ease(i / n);
        await b.evaluate(`window.scrollTo({ top: ${lerp(from, to, p).toFixed(2)}, behavior: 'instant' }), true`);
        state.x = lerp(fx, x2, p);
        state.y = lerp(fy, y2, p);
        await b.mouse("mouseMoved", state.x, state.y);
        await t.frame();
      }
    },
    /** Viewport rect of the first element matching the finder (a JS function body returning an element). */
    async rect(finder) {
      const r = await b.evaluate(`(() => { const el = (() => { ${finder} })(); if (!el) return null;
        const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top + scrollY }; })()`);
      if (!r) throw new Error(`element not found: ${finder.slice(0, 120)}`);
      return r;
    },
    showCursor(on = true) {
      state.cursor = on;
    },
    async moveTo(x, y, sec, ease = easeInOut) {
      const fx = state.x;
      const fy = state.y;
      const n = Math.max(1, Math.round(sec * FPS));
      // a slight arc, like a hand
      const dx = x - fx;
      const dy = y - fy;
      const bow = Math.min(40, Math.hypot(dx, dy) * 0.08);
      for (let i = 1; i <= n; i++) {
        const p = ease(i / n);
        const arc = Math.sin(Math.PI * p) * bow;
        const len = Math.hypot(dx, dy) || 1;
        state.x = fx + dx * p + (-dy / len) * arc;
        state.y = fy + dy * p + (dx / len) * arc;
        await b.mouse("mouseMoved", state.x, state.y);
        await t.frame();
      }
    },
    async moveToRect(r, sec, fx = 0.5, fy = 0.5) {
      await t.moveTo(r.x + r.w * fx, r.y + r.h * fy, sec);
    },
    async click() {
      await b.mouse("mousePressed", state.x, state.y, { button: "left", clickCount: 1, buttons: 1 });
      state.ripple = { x: state.x, y: state.y, k: 0, n: 12 };
      await t.frame();
      await t.frame();
      await b.mouse("mouseReleased", state.x, state.y, { button: "left", clickCount: 1 });
      await t.frame();
    },
    /** Types text at a human pace (seeded jitter), one character per scheduled frame. */
    async type(text, { seed = 7, cps = 11 } = {}) {
      let s = seed;
      const rnd = () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
      for (const ch of text) {
        await b.send("Input.insertText", { text: ch });
        let ms = (1000 / cps) * (0.6 + rnd() * 0.8);
        if (ch === " ") ms += 60 + rnd() * 110;
        const n = Math.max(1, Math.round(ms / (1000 / FPS)));
        for (let i = 0; i < n; i++) await t.frame();
      }
    },
    async finish(out) {
      const n = c.encode(out);
      b.close();
      const avg = state.frameMs.reduce((a, v) => a + v, 0) / Math.max(1, state.frameMs.length);
      return { frames: n, seconds: n / FPS, avgCaptureMs: Math.round(avg), errors: b.consoleErrors, flagged: state.flagged.length, firstFlags: state.flagged.slice(0, 5) };
    },
    abort() {
      b.close();
    },
  };
  return t;
}

/** Finder snippets */
export const byText = (sel, text, { exact = false, nth = 0 } = {}) =>
  `const all = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => ${
    exact ? `e.textContent.trim() === ${JSON.stringify(text)}` : `e.textContent.includes(${JSON.stringify(text)})`
  } && e.getClientRects().length); return all[${nth}] ?? null;`;

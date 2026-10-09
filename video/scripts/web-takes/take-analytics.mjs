// s12 · AI analytics, «Месяц», руководитель 3001: the month's cards, the question typed at a human pace, «Спросить»,
// (the model wait is cut), the answer's scope, the К-3 card and its «Доказательства».
import { resolve } from "node:path";
import { sleep } from "./cdp.mjs";
import { byText, startTake } from "./director.mjs";

const out = process.argv[2] ?? resolve(import.meta.dirname, "..", "..", "public/footage/s12-analytics-web.mp4");
const QUESTION = "покажи проблемы участка дробления за месяц";
const minute = Math.floor(Date.now() / 60000) * 60000 + 1000;
// the rolling «Месяц» window is pinned to the minute the take starts, so it does not refetch (and dim) mid take
const t = await startTake("analytics", { account: ["3001", "3333"], clock: { t0: minute, rate: 0.02 }, matchAnimations: false });
const quiet = `!document.querySelector('[data-stale]') && !document.body.textContent.includes('ИИ разбирает вопрос') && !document.querySelector('main [aria-busy="true"]')`;
try {
  await t.goto("/analytics");
  let started = Date.now();
  await t.ready(`document.querySelectorAll('main article').length > 0 && ${quiet}`, {
    timeout: 120000,
    label: "the month's insight cards",
  });
  console.log("month cards after", ((Date.now() - started) / 1000).toFixed(1), "s");
  console.log(
    JSON.stringify(
      await t.b.evaluate(`[...document.querySelectorAll('main article h3')].map(h => h.textContent)`),
      null,
      1,
    ),
  );
  await sleep(1500);
  console.log("calibrate", await t.calibrate());

  const bar = 125;
  t.state.x = 1120;
  t.state.y = 560;
  t.showCursor(true);
  await t.hold(1.4);

  const input = await t.rect(`return document.querySelector('main input[type="search"]');`);
  await t.moveTo(input.x + 90, input.y + input.h * 0.55, 1.0);
  await t.click();
  await t.hold(0.35);
  await t.type(QUESTION, { seed: 11, cps: 12 });
  await t.hold(0.45);
  const ask = await t.rect(byText("main button", "Спросить", { exact: true }));
  await t.moveToRect(ask, 0.7, 0.5, 0.55);
  await t.hold(0.15);
  // press on camera; the release submits and the clip cuts there (no frame of the loading state)
  await t.b.mouse("mousePressed", t.state.x, t.state.y, { button: "left", clickCount: 1, buttons: 1 });
  t.state.ripple = { x: t.state.x, y: t.state.y, k: 0, n: 12 };
  await t.frame();
  await t.frame();
  await t.frame();
  await t.b.mouse("mouseReleased", t.state.x, t.state.y, { button: "left", clickCount: 1 });
  t.state.ripple = null;

  // the wait for Haiku and Sonnet is cut
  started = Date.now();
  await t.realtime();
  await t.b.waitFor(
    `document.body.textContent.includes('Вопрос понят так') && document.querySelectorAll('main article').length > 0 && ${quiet}`,
    { timeout: 150000, interval: 250, label: "the answer cards" },
  );
  const answerSec = (Date.now() - started) / 1000;
  const answer = await t.b.evaluate(`(() => ({
    chips: [...document.querySelectorAll('main li')].slice(0, 8).map(l => l.textContent),
    cards: [...document.querySelectorAll('main article h3')].map(h => h.textContent),
    meta: document.querySelector('main')?.innerText.match(/claude[^\\n]*/g),
  }))()`);
  console.log("answer after", answerSec.toFixed(1), "s", JSON.stringify(answer, null, 1));
  const k3 = answer.cards.findIndex((c) => c.includes("К-3"));
  if (k3 < 0) throw new Error("no К-3 card in the answer");
  // warm the evidence orders off camera (open and close «Доказательства» once), so the panel opens without a spinner
  await t.b.evaluate(`(() => { const a = [...document.querySelectorAll('main article')][${k3}];
    const btn = [...a.querySelectorAll('button')].find(b => b.textContent.includes('Доказательства')); btn.click(); return true; })()`);
  await t.b.waitFor(`(() => { const a = [...document.querySelectorAll('main article')][${k3}]; return a.querySelectorAll('a[href*="/orders/"]').length > 0; })()`, {
    timeout: 30000,
    label: "evidence orders",
  });
  await t.b.evaluate(`(() => { const a = [...document.querySelectorAll('main article')][${k3}];
    const btn = [...a.querySelectorAll('button')].find(b => b.textContent.includes('Скрыть')); btn.click(); return true; })()`);
  await sleep(2500);
  await t.b.evaluate(`window.scrollTo({ top: 0, behavior: 'instant' }), true`);
  // the cut also rests the pointer away from the buttons (the row gained «Сбросить вопрос»)
  t.state.x = 1180;
  t.state.y = 640;
  await t.b.mouse("mouseMoved", t.state.x, t.state.y);
  await sleep(400);
  await t.calibrate();

  // the answer: scope chips and the first cards
  await t.hold(1.8);
  const card = await t.rect(`return [...document.querySelectorAll('main article')][${k3}];`);
  await t.moveTo(1180, 600, 0.6);
  await t.scrollTo(card.top - bar - 24, 2.0);
  await t.hold(2.6);

  const toggle = await t.rect(`const a = [...document.querySelectorAll('main article')][${k3}];
    return [...a.querySelectorAll('button')].find(b => b.textContent.includes('Доказательства'));`);
  await t.moveToRect(toggle, 1.0, 0.5, 0.55);
  await t.hold(0.2);
  await t.click();
  await t.hold(0.8);
  const panel = await t.rect(`const a = [...document.querySelectorAll('main article')][${k3}]; return a;`);
  // bring the open panel into view: the bottom of the card near the bottom of the screen
  const y = await t.scrollY();
  await t.moveTo(1250, 520, 0.6);
  await t.scrollTo(y + Math.max(0, panel.y + panel.h - 790), 2.2);
  await t.hold(3.2);
  console.log(await t.finish(out));
} catch (e) {
  t.abort();
  throw e;
}

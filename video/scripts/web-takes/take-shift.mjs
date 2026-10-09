// s10 · shift report, period «Смена»: counters, the AI summary (Claude), workload and downtime, then PDF and Excel.
// The page clock is pinned to 07:59 on 09.10 (Asia/Qostanay) so «Смена» resolves to the night shift 20:00–08:00 that
// had just ended when this was recorded (at 08:xx the day shift was minutes old and empty). The numbers and the
// summary are the live database's for that window.
import { resolve } from "node:path";
import { sleep } from "./cdp.mjs";
import { byText, startTake } from "./director.mjs";

const out = process.argv[2] ?? resolve(import.meta.dirname, "..", "..", "public/footage/s10-shift-report-web.mp4");
// SHIFT_CLOCK=<ISO> picks another moment; the recorded take used 07:59:05 on 09.10 in Asia/Qostanay.
const t0 = Date.parse(process.env.SHIFT_CLOCK ?? "2026-10-09T02:59:05Z");
const t = await startTake("shift", { account: ["1001", "1111"], clock: { t0, rate: 0.05 } });
try {
  await t.goto("/reports/shift");
  const started = Date.now();
  await t.ready(
    `!!document.querySelector('[class*="summaryLead"]') && !document.querySelector('[aria-busy="true"]') && document.body.innerText.includes('Простой оборудования')`,
    { timeout: 120000, label: "shift report with the AI summary" },
  );
  console.log("summary ready after", ((Date.now() - started) / 1000).toFixed(1), "s");
  const info = await t.b.evaluate(`(() => ({
    eyebrow: document.querySelector('main')?.innerText.split('\\n').slice(0, 3),
    lead: document.querySelector('[class*="summaryLead"]').textContent,
    meta: [...document.querySelectorAll('[class*="note"]')].map(e => e.textContent).filter(s => s.includes('Модель') || s.includes('модел')),
  }))()`);
  console.log(JSON.stringify(info, null, 1));
  await sleep(1500);
  console.log("calibrate", await t.calibrate());

  const vh = 810;
  const bar = 125; // the sticky top bar and filter row, CSS px
  t.state.x = 1180;
  t.state.y = 600;
  t.showCursor(true);
  await t.hold(1.5);

  const summary = await t.rect(byText("h2, h3", "Сводка ИИ", { exact: true }));
  await t.scrollTo(summary.top - bar - 18, 2.1);
  await t.hold(3.6);

  const workload = await t.rect(byText("h2, h3", "Загрузка исполнителей", { exact: true }));
  await t.scrollTo(workload.top - bar - 18, 2.0);
  await t.hold(2.2);

  await t.scrollTo(0, 2.0);
  const pdf = await t.rect(byText("button", "Скачать PDF"));
  const xlsx = await t.rect(byText("button", "Скачать Excel"));
  await t.moveToRect(pdf, 1.0, 0.55, 0.6);
  await t.hold(1.3);
  await t.moveToRect(xlsx, 0.7, 0.55, 0.6);
  await t.hold(1.5);
  console.log(await t.finish(out));
} catch (e) {
  t.abort();
  throw e;
}

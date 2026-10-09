// s11 · rating for «Месяц», workers tab: the stacked bars, Сериков's bar tooltip, then his row and first time fix.
import { resolve } from "node:path";
import { sleep } from "./cdp.mjs";
import { byText, startTake } from "./director.mjs";

const out = process.argv[2] ?? resolve(import.meta.dirname, "..", "..", "public/footage/s11-rating-web.mp4");
const minute = Math.floor(Date.now() / 60000) * 60000 + 1000;
// the rolling «Месяц» window is pinned to the minute the take starts, so it does not refetch (and dim) mid take
const t = await startTake("rating", { account: ["1001", "1111"], clock: { t0: minute, rate: 0.02 } });
try {
  await t.goto("/reports/rating?period=month");
  await t.ready(
    `document.querySelectorAll('.recharts-bar-rectangle').length > 40 && [...document.querySelectorAll('td')].some(td => td.textContent.includes('Сериков'))`,
    { timeout: 60000, label: "rating chart and table" },
  );
  await sleep(2500); // recharts mount animation, in real time
  console.log("calibrate", await t.calibrate());

  // rest the pointer to the right of the bars
  t.state.x = 1300;
  t.state.y = 330;
  t.showCursor(true);
  await t.hold(1.6);

  // Сериков's bar: the y of his axis tick, the x of the «С первого раза» (third) segment
  const tick = await t.rect(byText(".recharts-cartesian-axis-tick-label", "Сериков"));
  const segs = await t.b.evaluate(`(() => {
    const y = ${tick.y + tick.h / 2};
    const layers = [...document.querySelectorAll('.recharts-bar-rectangles')];
    return layers.map(l => { const rs = [...l.querySelectorAll('path.recharts-rectangle')]
      .map(p => p.getBoundingClientRect()).filter(r => r.top - 4 <= y && r.bottom + 4 >= y); return rs[0] ? { x: rs[0].x, w: rs[0].width } : null; });
  })()`);
  console.log("tick", tick, "segments", segs);
  const green = segs[2] ?? segs.find(Boolean);
  await t.moveTo(green.x + green.w * 0.55, tick.y + tick.h / 2, 1.3);
  await t.hold(2.4);

  // to the table: the header «С первого раза» first, then down the column to Сериков (the last row)
  const vh = 810;
  const head = await t.rect(`return [...document.querySelectorAll('thead th')].find(th => th.textContent.includes('С первого раза'));`);
  await t.moveTo(head.x + head.w * 0.7, 520, 0.6);
  await t.scrollAndMove(head.top - 205, head.x + head.w * 0.72, 205 + head.h * 0.55 + 16, 2.0);
  await t.hold(0.9);
  const row = await t.rect(byText("tbody tr", "Сериков"));
  const max = await t.b.evaluate("document.scrollingElement.scrollHeight - innerHeight");
  const target = Math.min(max, row.top + row.h + 70 - vh);
  const scrolled = await t.scrollY();
  const rowYAfter = row.top - target; // viewport y of the row once scrolled
  const cellX = head.x + head.w; // right aligned value ends at the cell's right edge
  await t.scrollAndMove(target, cellX - 3, rowYAfter + row.h * 0.5 + 11, 2.6);
  console.log("scrolled", scrolled, "target", target);
  await t.hold(3.2);
  console.log(await t.finish(out));
} catch (e) {
  t.abort();
  throw e;
}

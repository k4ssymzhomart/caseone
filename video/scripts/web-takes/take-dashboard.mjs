// Manager dashboard («Сводка», руководитель 3001, «Месяц»): the tiles, the top 5 problem units, the best workers.
import { resolve } from "node:path";
import { sleep } from "./cdp.mjs";
import { byText, startTake } from "./director.mjs";

const out = process.argv[2] ?? resolve(import.meta.dirname, "..", "..", "public/footage/s12-dashboard-web.mp4");
const minute = Math.floor(Date.now() / 60000) * 60000 + 1000;
const t = await startTake("dashboard", { account: ["3001", "3333"], clock: { t0: minute, rate: 0.02 } });
try {
  await t.goto("/dashboard");
  await t.ready(
    `document.body.textContent.includes('Топ 5 проблемного оборудования') && document.querySelectorAll('main tbody tr').length >= 8 && !document.querySelector('[data-stale]')`,
    { timeout: 90000, label: "dashboard tiles" },
  );
  await sleep(2000);
  console.log("calibrate", await t.calibrate());
  console.log(await t.b.evaluate(`document.querySelector('main').innerText.slice(0, 600)`));

  t.state.x = 1250;
  t.state.y = 175;
  t.showCursor(true);
  await t.hold(1.4);
  // across the tiles: «Наряды в работе», «Просрочено», «Среднее время реакции», then the second row
  const tile = (label) =>
    t.rect(`const el = [...document.querySelectorAll('main *')].find(e => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(label)});
      let p = el; while (p && p.getBoundingClientRect().height < 100) p = p.parentElement; return p;`);
  const a = await tile("Наряды в работе");
  await t.moveTo(a.x + a.w * 0.55, a.y + a.h * 0.62, 1.1);
  await t.hold(0.6);
  const b = await tile("Просрочено");
  await t.moveTo(b.x + b.w * 0.55, b.y + b.h * 0.62, 0.9);
  await t.hold(0.5);
  const c = await tile("Среднее время реакции");
  await t.moveTo(c.x + c.w * 0.55, c.y + c.h * 0.62, 0.9);
  await t.hold(0.5);
  const d = await tile("Простой оборудования");
  await t.moveTo(d.x + d.w * 0.55, d.y + d.h * 0.62, 0.9);
  await t.hold(0.7);
  // the top 5 units: Конвейер К-3
  const k3 = await t.rect(byText("main tbody tr", "Конвейер К-3"));
  await t.moveTo(k3.x + k3.w * 0.62, k3.y + k3.h * 0.55, 1.1);
  await t.hold(1.2);
  const best = await t.rect(byText("main tbody tr", "Петренко"));
  await t.moveTo(best.x + best.w * 0.6, best.y + best.h * 0.55, 1.0);
  await t.hold(2.0);
  console.log(await t.finish(out));
} catch (e) {
  t.abort();
  throw e;
}

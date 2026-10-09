// «Что видит ИИ» (admin 9001): the journal of requests to the model; filter «Проверка наряда», open the check of the
// order on «Насос НШ-32 маслостанции» (Течь масла), whose request names the worker only as E01.
import { resolve } from "node:path";
import { sleep } from "./cdp.mjs";
import { byText, startTake } from "./director.mjs";

const out = process.argv[2] ?? resolve(import.meta.dirname, "..", "..", "public/footage/s13-privacy-web.mp4");
const minute = Math.floor(Date.now() / 60000) * 60000 + 1000;
const t = await startTake("privacy", { account: ["9001", "9999"], clock: { t0: minute, rate: 0.02 } });
try {
  await t.goto("/admin/ai");
  await t.ready(`document.querySelectorAll('ul[aria-label] li').length > 5 && document.body.textContent.includes('Последние запросы')`, {
    timeout: 90000,
    label: "the journal",
  });
  await sleep(1500);
  console.log("calibrate", await t.calibrate());

  const bar = 125;
  t.state.x = 1180;
  t.state.y = 520;
  t.showCursor(true);
  await t.hold(1.8);

  const journal = await t.rect(byText("h2", "Последние запросы", { exact: true }));
  await t.scrollTo(journal.top - bar - 16, 1.8);
  await t.hold(0.4);
  const seg = await t.rect(byText("main button, main label, main [role=radio]", "Проверка наряда", { exact: true }));
  await t.moveToRect(seg, 1.0, 0.5, 0.6);
  await t.click();
  await t.hold(0.6);

  // the newest check of a «Течь масла» order with E01 (the hero's order): its row in the filtered list
  const rowIndex = await t.b.evaluate(`(async () => {
    const rows = [...document.querySelectorAll('ul[aria-label] li button')];
    for (let i = 0; i < rows.length; i++) {
      rows[i].click();
      await new Promise(r => setTimeout(r, 120));
      const d = document.querySelector('[class*="detail"]')?.textContent ?? '';
      if (d.includes('Исполнитель: E01') && d.includes('Течь масла')) { rows[0].click(); await new Promise(r => setTimeout(r, 120)); return i; }
    }
    rows[0].click();
    return -1;
  })()`);
  console.log("E01 row", rowIndex);
  if (rowIndex < 0) throw new Error("no E01 verify row");
  await sleep(500);
  const row = await t.rect(`return [...document.querySelectorAll('ul[aria-label] li button')][${rowIndex}];`);
  await t.moveToRect(row, 1.0, 0.4, 0.55);
  await t.click();
  await t.hold(0.8);

  // bring the message with the highlighted pseudonym into view
  const mark = await t.rect(`return [...document.querySelectorAll('[class*="detail"] mark')].find(m => m.textContent === 'E01');`);
  const detailHead = await t.b.evaluate(`document.querySelector('[class*="detail"]')?.innerText.split('\\n').slice(0, 4)`);
  console.log("detail", detailHead, "mark", mark);
  const y0 = await t.scrollY();
  const target = y0 + (mark.y - 470);
  await t.scrollTo(target, 1.8);
  const m2 = await t.rect(`return [...document.querySelectorAll('[class*="detail"] mark')].find(m => m.textContent === 'E01');`);
  await t.moveTo(m2.x + m2.w + 6, m2.y + m2.h + 4, 1.1);
  await t.hold(3.2);
  console.log(await t.finish(out));
} catch (e) {
  t.abort();
  throw e;
}

// Fold and full page screenshots at 1440 and 375 (light) for design iteration.
// usage: BASE=http://localhost:3100 node scripts/design-shots.mjs <out dir> / /pricing ...
import { chromium } from "playwright";
const B = process.env.BASE ?? "http://localhost:3000"; const out = process.argv[2]; const routes = process.argv.slice(3);
const b = await chromium.launch();
for (const w of [1440, 375]) {
  const c = await b.newContext({ viewport: { width: w, height: w < 800 ? 812 : 900 }, colorScheme: "light" });
  const p = await c.newPage();
  for (const r of routes) {
    await p.goto(B + r, { waitUntil: "networkidle", timeout: 120000 });
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((s) => setTimeout(s, 30)); } scrollTo(0, 0); });
    await p.waitForTimeout(500);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ov > 0) console.log("OVERFLOW", r, w, ov);
    const n = r === "/" ? "home" : r.slice(1).replace(/\//g, "_");
    await p.screenshot({ path: `${out}/${n}-${w}-fold-light.png` });
    await p.screenshot({ path: `${out}/${n}-${w}-light.png`, fullPage: true });
    if (process.env.MID) await p.screenshot({ path: `${out}/${n}-${w}-mid.png`, fullPage: true, clip: { x: 0, y: Number(process.env.MID), width: w, height: w < 800 ? 812 : 900 } });
  }
  await c.close();
}
await b.close();

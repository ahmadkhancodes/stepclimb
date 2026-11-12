import { chromium } from "playwright";
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const c = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await c.newPage();
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  const r = await p.evaluate(() => {
    const h1 = document.querySelector("h1"); const ul = h1.nextElementSibling;
    const sizes = new Set(); for (const el of document.querySelectorAll("main *, header *, footer *")) { if (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) sizes.add(getComputedStyle(el).fontSize + "/" + getComputedStyle(el).fontWeight); }
    const nav = document.querySelector("header > div"); const ns = getComputedStyle(nav);
    return { h1w: h1.getBoundingClientRect().width, h1text: h1.textContent, h1lines: Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)), subw: ul.getBoundingClientRect().width, sizes: [...sizes].sort(), overflow: document.documentElement.scrollWidth - innerWidth, navTop: nav.getBoundingClientRect().top, navW: nav.getBoundingClientRect().width, navBlur: ns.backdropFilter, navBg: ns.backgroundColor, italics: [...document.querySelectorAll("*")].filter(e => getComputedStyle(e).fontStyle === "italic").length };
  });
  console.log(w, JSON.stringify(r));
  // tagline reveal
  const words = p.locator(".kit-word");
  const before = await words.evaluateAll(ws => ws.map(x => getComputedStyle(x).opacity));
  await words.first().scrollIntoViewIfNeeded(); await p.mouse.wheel(0, 200); await p.waitForTimeout(300);
  const mid = await words.evaluateAll(ws => ws.map(x => getComputedStyle(x).opacity));
  await p.mouse.wheel(0, 600); await p.waitForTimeout(2500);
  const after = await words.evaluateAll(ws => ws.map(x => x.dataset.on ?? "-"));
  console.log("tagline before", before.slice(0,4).join(","), "mid", mid.map(x=>Number(x).toFixed(1)).join(","), "after", after.join(","));
  await c.close();
}
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const p = await c.newPage(); await p.goto("http://localhost:3100/");
console.log("reduced", (await p.locator(".kit-word").evaluateAll(ws => ws.map(x => getComputedStyle(x).opacity))).join(","));
const m = await b.newContext({ viewport: { width: 390, height: 844 } }); const mp = await m.newPage(); await mp.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await mp.click('button[aria-controls="mobile-menu"]'); await mp.waitForTimeout(1200);
const panel = await mp.evaluate(() => { const el = document.getElementById("mobile-menu"); const r = el.getBoundingClientRect(); return { h: r.height, bf: getComputedStyle(el).backdropFilter, delays: [...el.querySelectorAll("a")].map(a => a.style.transitionDelay) }; });
console.log("menu", JSON.stringify(panel)); await mp.screenshot({ path: "docs/qa/landing-compliance/after-menu-390.png" });
await b.close();

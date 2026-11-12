// Above-the-fold screenshots of competitor and ICP-adjacent sites for docs/design-brief.md.
// usage: node scripts/competitor-shots.mjs docs/design/refs/<date>
import { chromium } from "playwright";
const sites = { shift:"https://laravelshift.com", rector:"https://getrector.com", laravel:"https://laravel.com", forge:"https://forge.laravel.com", spatie:"https://spatie.be", news:"https://laravel-news.com" };
const out = process.argv[2];
const b = await chromium.launch();
for (const [k,u] of Object.entries(sites)) for (const w of [1440,375]) {
  const c = await b.newContext({viewport:{width:w,height:w<800?812:900}, colorScheme:"light"}); const p = await c.newPage();
  try { await p.goto(u,{waitUntil:"load",timeout:30000}); await p.waitForTimeout(1500);
    await p.screenshot({path:`${out}/${k}-${w}-fold.png`});
    console.log("ok",k,w);
  } catch(e){ console.log("fail",k,w,e.message.slice(0,80)); }
  await c.close();
}
await b.close();

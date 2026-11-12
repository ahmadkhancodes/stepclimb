// Signed-in app screenshots at 1440 and 375 (memory DB, GitHub fixtures, dev outbox).
// usage: BASE=http://localhost:3100 node scripts/app-screenshots.mjs <out dir> [screen names]
import { chromium } from "playwright";
const B = process.env.BASE ?? "http://localhost:3000"; const out = process.argv[2]; const only = process.argv.slice(3);
const b = await chromium.launch();
for (const w of [1440, 375]) {
  const c = await b.newContext({ viewport: { width: w, height: w < 800 ? 812 : 900 }, colorScheme: "light", baseURL: B });
  const p = await c.newPage(); const H = { origin: B };
  const email = `shot+${Date.now()}@studio.test`;
  await p.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: H });
  const box = await (await p.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await p.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)[0]);
  const shot = async (name, path) => {
    if (only.length && !only.includes(name)) return;
    await p.goto(B + path, { waitUntil: "networkidle", timeout: 120000 }); await p.waitForTimeout(400);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ov > 0) console.log("OVERFLOW", name, w, ov);
    await p.screenshot({ path: `${out}/app-${name}-${w}.png`, fullPage: true });
  };
  await shot("onboarding", "/onboarding");
  const org = await p.request.post("/api/auth/organization/create", { data: { name: "Kestrel Digital", slug: `k-${Date.now()}` }, headers: H });
  await p.request.post("/api/auth/organization/set-active", { data: { organizationId: (await org.json()).id }, headers: H });
  await shot("hangar-empty", "/app");
  await p.request.post("/api/dev/seed-github", { headers: H });
  await shot("hangar", "/app");
  const href = await p.locator('a:has-text("Open inspection")').first().getAttribute("href").catch(() => null);
  if (href) await shot("inspection", href);
  await shot("work-orders", "/app/work-orders");
  await shot("billing", "/app/billing");
  await shot("settings-profile", "/app/settings/profile");
  await shot("settings-members", "/app/settings/members");
  await shot("settings-api-keys", "/app/settings/api-keys");
  await c.close();
}
await b.close();

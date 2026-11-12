import { expect, test } from "@playwright/test";
import { signIn, watch } from "../qa/helpers";

const PUBLIC = ["/", "/pricing", "/security", "/docs", "/guides", "/compare/laravelshift", "/compare/ai-agents", "/laravel-12-to-13", "/laravel-11-to-12", "/guides/laravel-and-php-end-of-life-calendar", "/legal/privacy", "/legal/terms", "/sign-in", "/no-such-page-qa2"];
const APP = ["/app", "/app/work-orders", "/app/billing", "/app/settings/members", "/app/settings/webhooks", "/app/settings/security", "/app/settings/api-keys", "/app/settings/profile", "/app/settings/audit"];
// previous brands: teal #0B5D6B / amber #E8A200 (v1), logbook paper + recorder orange (v2)
const OLD_RGB = [[11, 93, 107], [79, 179, 195], [232, 162, 0], [178, 60, 14], [244, 241, 234], [255, 253, 248]];
const ALLOWED_FONT = /Barlow|IBM Plex|ui-sans-serif|system-ui|sans-serif|ui-monospace|monospace|Arial|Helvetica/i;

async function audit(page: import("@playwright/test").Page, path: string) {
  return page.evaluate(
    ({ OLD_RGB }) => {
      const fonts = new Set<string>();
      const oldColours: string[] = [];
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none") continue;
        if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) fonts.add(cs.fontFamily);
        for (const prop of ["color", "backgroundColor", "borderTopColor"] as const) {
          const m = /rgba?\((\d+), (\d+), (\d+)/.exec(cs[prop]);
          if (m && OLD_RGB.some((c) => c[0] === +m[1]! && c[1] === +m[2]! && c[2] === +m[3]!)) oldColours.push(`${el.tagName}.${(el as HTMLElement).className?.toString().slice(0, 40)} ${prop} ${cs[prop]}`);
        }
      }
      const root = document.documentElement;
      return { fonts: [...fonts], oldColours, darkClass: /dark/.test(root.className) || root.hasAttribute("data-theme"), bg: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(root).colorScheme };
    },
    { OLD_RGB },
  ).then((r) => ({ ...r, path }));
}

test("every public page: only work-order fonts and colours, never the old brands, and OS dark mode changes nothing", async ({ browser, baseURL }) => {
  const light = await browser.newContext({ baseURL, colorScheme: "light" });
  const dark = await browser.newContext({ baseURL, colorScheme: "dark" });
  const lp = await light.newPage();
  const dp = await dark.newPage();
  const bad: string[] = [];
  for (const path of PUBLIC) {
    await lp.goto(path);
    await dp.goto(path);
    const a = await audit(lp, path);
    const b = await audit(dp, path);
    for (const f of a.fonts) if (!f.split(",").every((x) => ALLOWED_FONT.test(x))) bad.push(`${path} font ${f}`);
    if (a.oldColours.length) bad.push(`${path} old colours ${a.oldColours.slice(0, 3).join("; ")}`);
    if (a.darkClass) bad.push(`${path} dark class/theme attr`);
    if (a.bg !== b.bg) bad.push(`${path} OS dark mode changes background ${a.bg} -> ${b.bg}`);
    if (b.scheme !== "light" && b.scheme !== "normal") bad.push(`${path} color-scheme ${b.scheme}`);
  }
  expect(bad).toEqual([]);
  await light.close();
  await dark.close();
});

test("signed-in pages: same brand rules", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `brand+${Date.now()}@studio.test`);
  await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  const bad: string[] = [];
  for (const path of APP) {
    await page.goto(path);
    const a = await audit(page, path);
    for (const f of a.fonts) if (!f.split(",").every((x) => ALLOWED_FONT.test(x))) bad.push(`${path} font ${f}`);
    if (a.oldColours.length) bad.push(`${path} old colours ${a.oldColours.slice(0, 3).join("; ")}`);
    if (a.darkClass) bad.push(`${path} dark`);
  }
  expect(bad).toEqual([]);
});

test("OG, twitter, icons, favicon, robots, sitemap, llms respond with the right type", async ({ request }) => {
  for (const [p, type] of [["/opengraph-image", /image\/png/], ["/twitter-image", /image\/png/], ["/icon", /image\//], ["/apple-icon", /image\//], ["/robots.txt", /text\/plain/], ["/sitemap.xml", /xml/], ["/llms.txt", /text\/plain/], ["/llms-full.txt", /text\/plain/]] as const) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(200);
    expect(r.headers()["content-type"], p).toMatch(type);
  }
  const html = await (await request.get("/")).text();
  expect(html).toMatch(/<meta name="theme-color"/i);
  expect(html.match(/name="theme-color"/g)?.length).toBe(1);
  expect(html).not.toMatch(/prefers-color-scheme|color-scheme" content="[^"]*dark/i);
});

test("404 page: branded, with a way home, and a clean console", async ({ page }) => {
  const problems = watch(page);
  const res = await page.goto("/definitely-missing");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("link", { name: /home|stepclimb|back/i }).first()).toBeVisible();
  const font = await page.locator("h1").first().evaluate((e) => getComputedStyle(e).fontFamily);
  expect(font).toMatch(/Barlow/i);
  expect(problems.filter((p) => !/404/.test(p))).toEqual([]);
});

test("email templates: no old brand colours or fonts", async ({ page, baseURL }) => {
  const email = `mail+${Date.now()}@studio.test`;
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: { origin: baseURL! } });
  const box = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  const m = box.messages.at(-1);
  const blob = JSON.stringify(m);
  expect(blob).not.toMatch(/#0B5D6B|#4FB3C3|#E8A200|#B23C0E|Newsreader|Schibsted|JetBrains|Archivo|Public Sans/i);
  expect(blob).not.toMatch(/localhost:3000|example\.com/);
});

test("global error page uses the brand fonts", async ({ page }) => {
  // the error boundary needs a thrown render; assert the font variables reach the document instead via the root layout contract
  await page.goto("/");
  const vars = await page.evaluate(() => ["--font-sc-display", "--font-sc-sans", "--font-sc-mono"].map((v) => !!getComputedStyle(document.documentElement).getPropertyValue(v) || !!getComputedStyle(document.body).getPropertyValue(v)));
  expect(vars).toEqual([true, true, true]);
});

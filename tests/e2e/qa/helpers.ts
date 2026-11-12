import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, baseURL: string, email: string, orgName: string | null = "Kestrel Digital") {
  const origin = { origin: baseURL };
  const start = await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  expect(start.ok()).toBeTruthy();
  const box = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)?.[0];
  await page.goto(link!);
  if (orgName) {
    const org = await page.request.post("/api/auth/organization/create", { data: { name: orgName, slug: `qa-${Date.now()}-${Math.floor(Math.random() * 1e5)}` }, headers: origin });
    expect(org.ok()).toBeTruthy();
    await page.request.post("/api/auth/organization/set-active", { data: { organizationId: (await org.json()).id }, headers: origin });
  }
}

/** Collect console errors, page errors and failed requests. */
export function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    // Vercel analytics only exists on Vercel; the 404 "Failed to load resource" lines carry no URL, so 4xx/5xx are asserted through the response handler
    if (/_vercel\/insights|Failed to load resource/.test(m.text())) return;
    if (m.type() === "error" || (m.type() === "warning" && /hydrat/i.test(m.text()))) problems.push(`console ${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => {
    if (/_vercel\/insights|_rsc=/.test(r.url())) return; // aborted prefetches on navigation are normal
    problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !/_vercel\/insights|\/api\/auth\/get-session|\/api\/auth\//.test(r.url())) problems.push(`http ${r.status()}: ${r.url()}`);
    if (r.status() >= 500) problems.push(`http ${r.status()}: ${r.url()}`);
  });
  return problems;
}

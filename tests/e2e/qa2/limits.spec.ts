import { expect, test } from "@playwright/test";
import { signIn, watch } from "../qa/helpers";

test("plan limits: a free workspace shows 1 of 1 seats without a false over-limit banner, and refuses a second member", async ({ page, browser, baseURL }) => {
  const problems = watch(page);
  const owner = `own+${Date.now()}@studio.test`;
  const mate = `mate+${Date.now()}@studio.test`;
  await signIn(page, baseURL!, owner);
  await page.goto("/app/billing");
  await expect(page.getByText(/1 of 1/).first()).toBeVisible(); // seats: live member count, not a stuck 0
  await expect(page.getByText(/over your limit|close to your limit/i)).toHaveCount(0);

  // invite a second person (creating the invitation is allowed) and let them accept: the plan has one seat
  await page.goto("/app/settings/members");
  await page.getByLabel(/email/i).first().fill(mate);
  await page.getByRole("button", { name: /invite|send/i }).first().click();
  await expect(page.getByText(mate).first()).toBeVisible();
  const box = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(mate)}`)).json();
  const invite = /https?:\/\/\S+accept-invite\/\S+/.exec(box.messages.at(-1).text)?.[0];
  expect(invite).toBeTruthy();

  const ctx = await browser.newContext({ baseURL });
  const p2 = await ctx.newPage();
  await signIn(p2, baseURL!, mate, null);
  await p2.goto(invite!);
  await p2.getByRole("button", { name: /accept/i }).click();
  await expect(p2.getByText(/every seat/)).toContainText(/every seat|upgrade/i);
  await expect(p2).toHaveURL(/accept-invite/);
  await ctx.close();
  expect(problems.filter((p) => !/40[0-9]/.test(p))).toEqual([]);
});

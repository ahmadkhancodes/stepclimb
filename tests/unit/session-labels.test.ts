import { describe, expect, it } from "vitest";
import { planCta, sessionCta } from "@/components/marketing/session-labels";

describe("session-aware marketing labels", () => {
  it("keeps the signed-out CTA and swaps to the app when signed in", () => {
    const out = { href: "/sign-in", label: "Inspect a repo free" };
    expect(sessionCta(false, out)).toEqual(out);
    expect(sessionCta(true, out)).toEqual({ href: "/app", label: "Open Stepclimb" });
  });
  it("pricing: signed in never says start free and paid plans go to billing", () => {
    const free = { id: "free", name: "Free", cta: "Inspect a repo free" };
    const studio = { id: "studio", name: "Studio", cta: "Choose Studio" };
    expect(planCta(false, free, null)).toEqual({ href: "/sign-in?plan=free", label: "Inspect a repo free" });
    expect(planCta(true, free, null)).toEqual({ href: "/app", label: "Open Stepclimb" });
    expect(planCta(false, studio, { interval: "year" }).href).toBe("/sign-in?plan=studio&interval=year");
    expect(planCta(true, studio, { interval: "year" })).toEqual({ href: "/app/billing?plan=studio&interval=year", label: "Choose Studio" });
  });
});

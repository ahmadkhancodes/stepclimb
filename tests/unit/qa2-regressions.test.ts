import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-redesign regressions", () => {
  it("global-error (replaces the root layout) attaches the brand font variables, so it never falls back to system fonts", () => {
    const src = readFileSync("src/app/global-error.tsx", "utf8");
    expect(src).toMatch(/from "\.\/fonts"/);
    expect(src).toMatch(/display\.variable/);
    expect(src).toMatch(/sans\.variable/);
    expect(src).toMatch(/mono\.variable/);
  });
});

import { currentUsage } from "@/lib/billing/usage";
import { createMemoryDb } from "@/lib/db/memory";

describe("seat usage", () => {
  it("shows live members against the plan's seats; a full house is not a warning, one too many is", async () => {
    const db = createMemoryDb("stepclimb");
    const [one] = await currentUsage(db, "org1", ["seats"], new Date(), 1);
    expect(one).toMatchObject({ used: 1, limit: 1, level: "ok" });
    const [two] = await currentUsage(db, "org1", ["seats"], new Date(), 2);
    expect(two).toMatchObject({ used: 2, limit: 1, level: "over" });
  });
});

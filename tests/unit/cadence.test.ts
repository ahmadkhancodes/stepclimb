import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SCHEDULER_CADENCE, cadenceCopy } from "@/config/product";
import { isAutopilotWindow } from "@/lib/autopilot/schedule";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const publicFiles = [
  ...walk("src/app/(marketing)"),
  ...walk("src/content"),
  ...walk("src/components/marketing"),
  ...walk("src/components/content"),
].filter((f) => /\.(tsx?|md)$/.test(f));

/** Phrases that only a faster-than-daily scheduler (or a live worker) could make true. */
const FAST_CLAIMS = [
  /every (hour|\d+ ?min)/i, /\bhourly\b/i, /within (a few |\d+ )?minutes/i, /\d+ min(ute)?s? ago/i,
  /real-?time/i, /\blive (status|updates?|monitoring)\b/i, /30 seconds, 2 minutes/i, /every minute/i,
];

describe("cadence honesty", () => {
  it("vercel.json has at most two crons, none more often than daily", () => {
    const { crons } = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(crons.length).toBeLessThanOrEqual(2);
    for (const c of crons) {
      const [min, hour, dom, , dow] = c.schedule.split(" ");
      expect(/^\d+$/.test(min!) && /^\d+$/.test(hour!), c.schedule).toBe(true);
      expect(dom === "*" || /^\d+$/.test(dom!)).toBe(true);
      expect(dow === "*" || /^\d+$/.test(dow!)).toBe(true);
    }
  });

  it("page copy matches the cadence constant", () => {
    if (SCHEDULER_CADENCE === "daily") {
      expect(cadenceCopy.webhookRetries).toMatch(/once a day/);
      expect(cadenceCopy.webhookRetries).not.toMatch(/seconds|minutes/);
      for (const f of publicFiles) {
        const text = readFileSync(f, "utf8");
        for (const re of FAST_CLAIMS) {
          if (f.endsWith("product.ts") || f.includes("legal/")) continue;
          // the faster copy lives only behind the constant in product.ts
          expect(text, `${f} matches ${re}`).not.toMatch(re);
        }
      }
    } else {
      expect(cadenceCopy.webhookRetries).toMatch(/30 seconds/);
    }
  });

  it("no visible sample/demo/stub wording on public pages", () => {
    for (const f of publicFiles.filter((x) => !x.endsWith("data.ts"))) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/Sample[ ,]|>Sample|"Sample|not configured in this environment|\bstub mode\b/);
    }
  });

  it("daily scheduler lets the weekly autopilot start on any day", () => {
    expect(isAutopilotWindow(new Date("2026-11-10T04:00:00Z"), "America/New_York", "daily")).toBe(true);
    expect(isAutopilotWindow(new Date("2026-11-10T04:00:00Z"), "America/New_York", "hourly")).toBe(false);
  });
});

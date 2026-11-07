import { json } from "@/lib/http";
import { newChallenge } from "@/lib/security/altcha";
import { limitByIp, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ALTCHA challenge for the <altcha-widget challengeurl="/api/altcha"> on public forms. */
export async function GET(req: Request) {
  try { await limitByIp(req, "altcha", RULES.publicForm); } catch { return json({ error: "rate_limited" }, 429); }
  return json(await newChallenge());
}

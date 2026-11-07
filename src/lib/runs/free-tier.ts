import type { Db } from "@/lib/db";
import type { RunDoc } from "./types";
import { isTerminal } from "./types";

/** Free tier (P0-12): a GitHub account at least 30 days old, one PR a month, public repositories only. */
export const FREE_TIER = { minAccountAgeDays: 30, prsPerMonth: 1 } as const;

export type FreeTierReason = "private_repo" | "account_too_new" | "account_age_unknown" | "monthly_limit";
export type FreeTierCheck = { ok: true } | { ok: false; reason: FreeTierReason };

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export async function checkFreeTier(db: Db, i: { accountId: string; repoPrivate: boolean; githubCreatedAt: Date | null; now: Date }): Promise<FreeTierCheck> {
  if (i.repoPrivate) return { ok: false, reason: "private_repo" };
  if (!i.githubCreatedAt) return { ok: false, reason: "account_age_unknown" };
  if (i.now.getTime() - i.githubCreatedAt.getTime() < FREE_TIER.minAccountAgeDays * 86_400_000) return { ok: false, reason: "account_too_new" };
  const mine = (await db.docs.find<RunDoc>("runs", { accountId: i.accountId })).filter((r) => r.billing.via === "free" && monthKey(new Date(r.createdAt)) === monthKey(i.now) && (isTerminal(r.status) ? r.status === "succeeded" || r.status === "timed_out" : true));
  return mine.length >= FREE_TIER.prsPerMonth ? { ok: false, reason: "monthly_limit" } : { ok: true };
}

const NOT_FREE: Record<FreeTierReason, string> = {
  private_repo: "The free pull request is for public repositories.",
  account_too_new: "The free pull request needs a GitHub account at least 30 days old.",
  account_age_unknown: "We could not confirm the age of your GitHub account.",
  monthly_limit: "The free pull request this month is used.",
};
export const freeTierMessage = (r: FreeTierReason) => NOT_FREE[r];

/** GitHub account creation date for the installation owner (public endpoint, cached 7 days in `github_users`). Fixture mode returns an old date. */
export async function githubAccountCreatedAt(db: Db, login: string, fetchImpl: typeof fetch = fetch): Promise<Date | null> {
  if (!login) return null;
  if (process.env.GITHUB_FIXTURES === "1") return new Date("2015-01-01T00:00:00Z");
  const key = login.toLowerCase();
  const hit = await db.docs.get<{ createdAt: string; checkedAt: number }>("github_users", key);
  if (hit && Date.now() - hit.checkedAt < 7 * 86_400_000) return new Date(hit.createdAt);
  try {
    const res = await fetchImpl(`https://api.github.com/users/${encodeURIComponent(login)}`, { headers: { accept: "application/vnd.github+json", "user-agent": "stepclimb" } });
    if (!res.ok) return null;
    const created = ((await res.json()) as { created_at?: string }).created_at;
    if (!created) return null;
    await db.docs.put("github_users", key, { createdAt: created, checkedAt: Date.now() });
    return new Date(created);
  } catch { return null; }
}

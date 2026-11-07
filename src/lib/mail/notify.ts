import { oneOffs } from "@/config/product";
import type { Db } from "@/lib/db";
import { log } from "@/lib/logger";
import { sendMail, unsubscribeUrl, type MailTransport } from "./index";
import { receiptEmail, runFailedEmail, runFinishedEmail, weeklyPrEmail } from "./product-templates";
import type { SendResult } from "./types";

/**
 * Product mail through the Mailer interface. Notifications carry List-Unsubscribe and honour the suppression list;
 * receipts are transactional. A mail failure never fails a run or a webhook: it is logged and swallowed.
 */
export const NOTIFICATION_SCOPE = "notification";

/** Where mail for an account goes: the contact saved at sign in or checkout (`account_contacts`), else the billing email. */
export async function accountEmail(db: Db, accountId: string): Promise<string | null> {
  const c = await db.docs.get<{ email?: string }>("account_contacts", accountId);
  if (c?.email) return c.email;
  return (await db.getBillingAccount(accountId))?.email ?? null;
}
export const saveContact = (db: Db, accountId: string, email: string) => db.docs.put("account_contacts", accountId, { email: email.toLowerCase(), updatedAt: new Date() });

async function deliver(
  db: Db,
  accountId: string,
  build: (unsub: string) => { subject: string; text: string; html: string },
  opts: { category: "notification" | "transactional"; tag: string },
  transport?: MailTransport,
): Promise<SendResult | null> {
  try {
    const to = await accountEmail(db, accountId);
    if (!to) return null;
    const m = build(opts.category === "notification" ? await unsubscribeUrl(to, NOTIFICATION_SCOPE) : "");
    return await sendMail({ to, ...m, category: opts.category, tags: { kind: opts.tag } }, transport, db);
  } catch (e) {
    log.error("mail_failed", { route: `mail/${opts.tag}`, message: (e as Error).message });
    return null;
  }
}

type RunFinished = Omit<Parameters<typeof runFinishedEmail>[0], "unsubscribeUrl">;
type RunFailed = Omit<Parameters<typeof runFailedEmail>[0], "unsubscribeUrl">;
type Weekly = Omit<Parameters<typeof weeklyPrEmail>[0], "unsubscribeUrl">;

export const mailRunFinished = (db: Db, accountId: string, i: RunFinished, t?: MailTransport) =>
  deliver(db, accountId, (u) => runFinishedEmail({ ...i, unsubscribeUrl: u }), { category: "notification", tag: "run_finished" }, t);
export const mailRunFailed = (db: Db, accountId: string, i: RunFailed, t?: MailTransport) =>
  deliver(db, accountId, (u) => runFailedEmail({ ...i, unsubscribeUrl: u }), { category: "notification", tag: "run_failed" }, t);
export const mailWeeklyPr = (db: Db, accountId: string, i: Weekly, t?: MailTransport) =>
  deliver(db, accountId, (u) => weeklyPrEmail({ ...i, unsubscribeUrl: u }), { category: "notification", tag: "weekly_pr" }, t);
export const mailReceipt = (db: Db, accountId: string, i: Parameters<typeof receiptEmail>[0], t?: MailTransport) =>
  deliver(db, accountId, () => receiptEmail(i), { category: "transactional", tag: "receipt" }, t);

export const creditDescription = (kind: string) => oneOffs.find((o) => o.kind === kind)?.name ?? "One time credit";

/**
 * Bounce and complaint events from the mail provider. Hard bounces and complaints suppress the address for ALL mail,
 * transactional included (sending on would hurt the sending domain). Soft (transient) bounces are ignored.
 */
export async function applyMailEvent(db: Db, ev: { type: string; to: string[]; bounceType?: string }): Promise<{ suppressed: string[] }> {
  const bt = (ev.bounceType ?? "").toLowerCase();
  const bounced = ev.type === "email.bounced" && bt !== "transient" && bt !== "soft" && bt !== "temporary";
  const complained = ev.type === "email.complained";
  if (!bounced && !complained) return { suppressed: [] };
  for (const to of ev.to) await db.addSuppression({ email: to, scope: "all", reason: complained ? "complaint" : "bounce" });
  return { suppressed: ev.to.map((t) => t.toLowerCase()) };
}

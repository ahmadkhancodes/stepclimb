import { button, esc, layout } from "./templates";

// Product mail: run finished, run failed, weekly autopilot PR, receipt. Each returns {subject, text, html}.
export interface MailFooter { unsubscribeUrl?: string }

function withFooter(text: string, html: string, f: MailFooter) {
  if (!f.unsubscribeUrl) return { text, html };
  return {
    text: `${text}\n\n--\nStop these emails: ${f.unsubscribeUrl}`,
    html: html.replace("</body>", `<p style="max-width:520px;margin:8px auto 0;font-size:12px;color:#4a6178"><a href="${esc(f.unsubscribeUrl)}" style="color:#4a6178">Stop these emails</a></p></body>`),
  };
}

export interface RunMailInput extends MailFooter {
  workOrderNo: number;
  fullName: string;
  hopTo: number;
  /** VERIFIED, UNVERIFIED or TIMED OUT */
  stamp: string;
  prUrl: string | null;
  runUrl: string;
  detail: string;
}

const stampWord = (s: string) => s[0] + s.slice(1).toLowerCase();

/** "Work order #4821 · acme/portal to Laravel 13 · Verified" */
export function runFinishedEmail(i: RunMailInput) {
  const subject = `Work order #${i.workOrderNo} · ${i.fullName} to Laravel ${i.hopTo} · ${stampWord(i.stamp)}`;
  const text = `${i.detail}\n\n${i.prUrl ? `Pull request: ${i.prUrl}\n` : ""}Work order: ${i.runUrl}`;
  const body = `<h1 style="margin:0 0 8px;font-size:20px">${esc(stampWord(i.stamp))}: ${esc(i.fullName)} to Laravel ${i.hopTo}</h1>
<p style="margin:0;font-size:14px;line-height:20px;color:#2c4660">${esc(i.detail)}</p>
${i.prUrl ? button(i.prUrl, "Open the pull request") : ""}<p style="margin:0;font-size:13px"><a href="${esc(i.runUrl)}">Work order #${i.workOrderNo}</a></p>`;
  const h = withFooter(text, layout(subject, body), i);
  return { subject, text: h.text, html: h.html };
}

export function runFailedEmail(i: Omit<RunMailInput, "stamp" | "prUrl"> & { reason: string; credited: boolean }) {
  const subject = `Work order #${i.workOrderNo} · ${i.fullName} to Laravel ${i.hopTo} · Failed`;
  const credit = i.credited ? "Nothing was delivered, so your credit was returned." : "";
  const text = `${i.detail}\n\nWhat happened: ${i.reason}\n${credit}\n\nWork order: ${i.runUrl}`;
  const body = `<h1 style="margin:0 0 8px;font-size:20px">The run did not finish</h1>
<p style="margin:0 0 8px;font-size:14px;line-height:20px;color:#2c4660">${esc(i.detail)}</p>
<p style="margin:0 0 8px;font-size:14px;line-height:20px;color:#2c4660">What happened: ${esc(i.reason)}. ${esc(credit)}</p>
${button(i.runUrl, "Open the work order")}`;
  const h = withFooter(text, layout(subject, body), i);
  return { subject, text: h.text, html: h.html };
}

export function weeklyPrEmail(i: MailFooter & { fullName: string; weekLabel: string; updateCount: number; stamp: string; prUrl: string; refreshed: boolean }) {
  const subject = `${i.refreshed ? "Refreshed" : "New"} weekly dependency PR · ${i.fullName} · ${stampWord(i.stamp)}`;
  const n = `${i.updateCount} dependenc${i.updateCount === 1 ? "y" : "ies"}`;
  const text = `${n} updated for the week of ${i.weekLabel}. Status: ${stampWord(i.stamp)}.\n\n${i.prUrl}`;
  const body = `<h1 style="margin:0 0 8px;font-size:20px">Weekly dependency PR</h1>
<p style="margin:0;font-size:14px;line-height:20px;color:#2c4660">${n} updated for the week of ${esc(i.weekLabel)}. Status: ${esc(stampWord(i.stamp))}.${i.refreshed ? " This refreshes the open pull request instead of opening a new one." : ""}</p>
${button(i.prUrl, "Open the pull request")}`;
  const h = withFooter(text, layout(subject, body), i);
  return { subject, text: h.text, html: h.html };
}

/** Receipts are transactional: no unsubscribe link. */
export function receiptEmail(i: { description: string; amountUsd: number; reference: string; invoiceUrl?: string | null; date: Date }) {
  const amount = `$${(i.amountUsd / 100).toFixed(2)}`;
  const subject = `Receipt for ${i.description} · ${amount}`;
  const day = i.date.toISOString().slice(0, 10);
  const text = `Receipt: ${i.description}\nAmount: ${amount} USD\nDate: ${day}\nReference: ${i.reference}${i.invoiceUrl ? `\nInvoice: ${i.invoiceUrl}` : ""}`;
  const body = `<h1 style="margin:0 0 8px;font-size:20px">Receipt</h1>
<table role="presentation" style="font-size:14px;line-height:22px;color:#2c4660"><tr><td style="padding-right:16px">Item</td><td>${esc(i.description)}</td></tr><tr><td>Amount</td><td>${esc(amount)} USD</td></tr><tr><td>Date</td><td>${day}</td></tr><tr><td>Reference</td><td>${esc(i.reference)}</td></tr></table>
${i.invoiceUrl ? button(i.invoiceUrl, "View invoice") : ""}`;
  return { subject, text, html: layout(subject, body) };
}

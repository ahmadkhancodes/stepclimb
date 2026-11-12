# Adversarial security review: Stepclimb by BufferSol

Date: 12 Nov 2026. Scope: the code in this repo, run locally (`next start`, memory DB, outbox mail, GitHub fixtures). Not deployed.
Earlier reviews: `docs/REVIEW.md` (P0-1 to P0-5, P1, P2) and `docs/QA-REPORT.md`. This pass did not repeat them; it attacked again from scratch with real requests.

Regression tests: `tests/unit/adversary.test.ts` (12 tests, all failed before the fixes) and `tests/e2e/qa/adversary.spec.ts` (7 Playwright attack runs; 4 failed before the fixes).

## Threat model

**Assets**
- Customer GitHub access: installation tokens minted for their repos, the PRs and check runs we write (a forged "Verified" check is the worst outcome for the product's promise).
- Customer data per organisation: repos, inspections, work orders, run logs and squawks, autopilot settings, webhooks and their signing secrets, API keys, members and invitations, audit log, billing records.
- Money: subscriptions and per-PR credits (Stripe), plan limits (repos, seats, extended verify).
- Founder console (`/admin`, `/api/admin/*`): refunds, flags, pins, GitHub App credentials (manifest callback).
- Secrets: `BETTER_AUTH_SECRET`, `APP_ENCRYPTION_KEY`, Stripe, Resend, GitHub App key, `CRON_SECRET`, webhook secrets.

**Actors**
- Anonymous internet user (sign-in form, public pages, webhooks endpoints, unsubscribe links).
- Signed-in customer of another organisation (the main attacker here: wants other tenants' data or free paid features).
- Low-privilege member or viewer inside an organisation (wants admin, billing or the audit log).
- Customer code running in the sandbox (composer scripts, tests): wants to forge results (covered by REVIEW P0-2, P1-6).
- Third parties sending webhooks (Stripe, GitHub, Resend) and anyone replaying them.

**Entry points**
- 38 route handlers under `src/app/api` (listed in `docs/ARCHITECTURE.md`), Better Auth under `/api/auth/*` (magic link, GitHub OAuth, organisations, invitations, API keys, passkeys, TOTP), app pages under `/app/*` and `/admin/*` with `[id]` params, signed webhooks (`/api/stripe/webhook`, `/api/github/webhook`, `/api/mail/webhook`, `/api/runner/events`), `/api/cron/[job]` (bearer), unsubscribe links, outbound webhook delivery (server-side fetch of a customer URL).
- No server actions (`"use server"` appears nowhere).

## Findings (most severe first)

| # | Sev | Finding | What an attacker could have done | Fix | Test |
|---|---|---|---|---|---|
| SR-4 | High | GitHub was a **trusted provider** for account linking (`accountLinking.trustedProviders: ["github"]`) | Better Auth then links a GitHub sign in to an existing account by email **without** checking GitHub's `verified` flag. Anyone who adds a victim's address to their GitHub profile (unverified) and clicks "Sign in with GitHub" lands in the victim's account. With the victim being in `ADMIN_EMAILS`, that is the founder console too. Live only once GitHub OAuth is configured. | `trustedProviders: []`: linking needs GitHub's verified flag (`src/lib/auth/index.ts`) | unit SR-4 |
| SR-3 | High | `isFounderAdmin` looked at the address only | Same path as SR-4 without linking: a new account created through GitHub with an unverified `founder@` address passed every founder check (`/admin`, `/api/admin/refund`, manifest callback, no-op runs) outside the production TOTP gate | founder = `ADMIN_EMAILS` **and** `emailVerified === true`; every caller passes the user (`src/lib/auth/session.ts`) | unit SR-3 |
| SR-1 | High | Webhook SSRF guard was a hostname regex at save time only | `https://localhost./`, `https://100.64.0.1/` (CGNAT), `https://198.18.0.1/`, multicast, single-label intranet names and any public name that resolves (or rebinds) to `127.0.0.1` / `169.254.169.254` passed. The "Send test" button returns the status code, so this was a port and service oracle into the hosting network (on the planned VPS: the metadata service and anything on localhost). | `isSafeWebhookUrl` normalises the host (trailing dots, brackets), refuses credentials, single-label and internal suffixes, and checks literal IPs against full v4/v6 private, reserved, CGNAT, mapped and NAT64 ranges. Delivery re-checks the URL every attempt and goes through `safePost` (node `http`/`https`) whose socket `lookup` validates **every** DNS answer before connecting, so there is no check-then-rebind gap. No redirects, body never read, 10 s timeout. (`src/lib/webhooks/outbound.ts`) | unit SR-1 (4), e2e "SSRF" |
| SR-2 | Medium | Rate limits keyed on a spoofable IP and on the raw address | Off Vercel, Next keeps a client supplied `X-Forwarded-For` (`base-server.js`: `??=`), and `clientIp` used its left entry: rotating that header reset the per-IP limits on sign in, invitations, scans and unsubscribe. `victim+1@`, `victim+2@`... each had their own 5 per 10 minutes, so one attacker could fill a victim's inbox with sign-in mails (ALTCHA is cheap proof of work). The guard matched the raw path, so case or `%2D` encodings were a theoretical bypass. On Vercel the edge overwrites the header, so production was protected by the platform; the planned VPS move was not. | `clientIp`: Vercel's `x-real-ip` on Vercel, else the entry `TRUSTED_PROXY_HOPS` (default 1) from the right. `mailboxKey` folds case, spaces, `+tags` and Gmail dots for magic links and invitations. `authPath` decodes, lower-cases and trims before matching (`src/lib/http.ts`, `src/lib/security/magic-link-guard.ts`) | unit SR-2 (5) |
| SR-5 | Medium | The personal data export gave every member the organisation's records | `GET /api/account/export` included the org's **audit log**, billing account and entitlement for every org the user belongs to, so a viewer or member read what `audit:read` (owner/admin only) withholds from them in the app. | Org records are included only when the role has `audit:read`; members get their membership and role (`src/app/api/account/export/route.ts`) | e2e "inside one org" |
| SR-6 | Low (broken control) | Role table did not have the actions the API key plugin checks (`create`, `update`, `delete`) | Not exploitable (it failed closed): admins, whom the settings page offers "Create key", got `INSUFFICIENT_API_KEY_PERMISSIONS`; only the creator role passed. Fixed so the control does what the UI says, with members and viewers still refused. | `apiKey` statements gain `create/update/delete` for owner and admin (`src/lib/auth/roles.ts`) | unit SR-6, e2e "an admin can manage the org's API keys" |
| SR-7 | Low | `DELETE /api/webhooks/:id` with another org's id answered 200 and wrote `webhook.deleted` into the caller's audit log | No data touched (the delete was org scoped), but the audit log recorded deletions that never happened and the answer confirmed nothing. | 404 unless the endpoint is in the caller's org, no audit line (`src/app/api/webhooks/[id]/route.ts`) | e2e "tenant isolation" |

## Attacked and held (no change needed)

- **Tenant isolation**: with two orgs, every run, repo, scan, autopilot, webhook (patch, test, delete, deliveries), API key (list, create, delete), organisation (full read, update, delete, set-active, invite, list invitations) request with the other org's ids, and ids of another resource type, was refused or empty; `/app/work-orders/:id`, `/app/repos/:id`, `/app/inspections/:id` render the 404 view with no data (status is 200 because `/app/loading.tsx` streams first; nothing of the other org is in the page). CSV export, audit and the account export carry nothing of the other org.
- **Inside an org**: a member cannot promote themselves to admin or owner, demote or remove the owner, invite an owner, delete the org, read the audit log, create webhooks, open checkout or the portal, or see `/admin` (404). An invitation id cannot be accepted by a different address.
- **Authentication**: a magic link works once (a replay from a second browser gets no session); after sign out the old session cookie is dead; session cookies are `HttpOnly`, `SameSite=Lax`, and `__Host-` + `Secure` on https (`cookieConfig`); `callbackURL` to another origin is refused by Better Auth; `?next=//evil`, `https://evil`, `/\evil`, `javascript:` stay on site (`safeNext`). Magic links expire in 10 minutes; the verify URL redirects at once and `Referrer-Policy: strict-origin-when-cross-origin` keeps the token out of third party Referers.
- **CSRF**: every cookie-authenticated non-GET goes through `withApi` (Origin/Referer check); Better Auth checks Origin against `trustedOrigins`. GET handlers have no side effects except `/api/github/setup` (GitHub's required Setup URL): it can only claim installations GitHub lists for the signed-in user's own token, into their own org.
- **Injection**: operator objects (`{"$ne": null}`, `{"$gt": 0}`) and `__proto__` keys in bodies are refused by zod (400); query params are strings; a hostile organisation name (`<img onerror>`) renders as text; mail templates escape every interpolated value; the Resend transport is JSON (no raw headers), SMTP is not implemented; CSV cells are formula-defused (REVIEW battle pass).
- **Webhooks in**: Stripe, GitHub and Resend verify signatures on the raw body with timestamp tolerance, record event ids after success, recompute state from Stripe (REVIEW "Reviewed and found sound"). Runner events: per run secret and sequence numbers.
- **Billing tampering**: plan and interval are enums mapped to our catalogue prices; quantity is paid per unit; trials and credits are granted only by the webhook; weekly autopilot and seats are enforced server side (402 / `membershipLimit`).
- **Exposure**: a malformed body returns `{"error":"bad_json"}` with no stack; 1.1 MB bodies get 413; no `.map` files are served and `/_next/static/` is not listable; `npm run scan:bundle` finds no secrets in `.next/static`; the only `NEXT_PUBLIC_` variable is the app URL; `/api/health` names no host, key or error.
- **Headers**: CSP, HSTS (preload), `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, COOP, Permissions-Policy; the existing browser CSP audit (`tests/e2e/qa/battle.spec.ts`) sees no violation on 16 pages. `script-src 'unsafe-inline'` stays (Next without nonces); see recommendations.
- **Availability**: list endpoints are capped (runs 50, audit 50, deliveries 100, endpoints 20 per org); JSON bodies capped at 1 MB, webhooks at 1 to 5 MB; webhook delivery has a 10 s timeout and never reads the body.
- **Dependencies**: `npm audit --omit=dev`: 0 vulnerabilities. Full `npm audit`: one moderate `minimatch` ReDoS inside `typescript-eslint` (lint tooling only, never shipped); the only fix offered is a breaking downgrade of `eslint-config-next`, so it stays.

## Open, needs a product or infrastructure decision

1. **Better Auth's own rate limiter** keys on the left `X-Forwarded-For` entry. Safe on Vercel (edge overwrites). Before the VPS move, set `advanced.ipAddress.ipAddressHeaders` to a header the proxy sets (for example `x-real-ip` from nginx) and make the proxy overwrite, not append.
2. **`MAIL_CONSOLE_PRINT=1`** prints full mail bodies, including live magic links, into the server log. It exists so the owner can sign in before Resend is set up. Recommendation: remove it from the Vercel env as soon as `RESEND_API_KEY` exists (MANUAL_STEPS); anyone with log access can sign in as anyone while it is on.
3. **CSP `script-src 'unsafe-inline'`**: moving to nonces needs dynamic rendering for every page (loses static marketing pages). Recommendation: keep until there is any user HTML rendering path; none exists today.
4. **Account deletion** deletes an org the user owns alone even when other members remain (they lose access). Product call: block deletion while other members exist, or transfer ownership first.
5. **Viewer can start a free inspection** (`POST /api/repos/:id/scan` needs only membership). Read-only against GitHub and rate limited; harmless, left as is.
6. Still open from `docs/REVIEW.md`: P1-6 and P1-7 (sandbox adapter requirements), P2-5 (installation token revoke).

# Pre-launch review: Stepclimb by BufferSol (M5)

Date: 7 Nov 2026. Reviewer: build session (Opus), reading the code on `main` at 78e61de, not PROGRESS.
Scope: repo safety, sandbox, tenant isolation, security, billing, claims, accessibility, ops.
Regression tests for every P0: `tests/unit/review.test.ts` (14 of its 15 tests fail on 78e61de and pass after the fix; the 15th guards refunds).

Severity: **P0** = could hurt a real customer (bad or malicious PR, leaked code or tokens, cross-tenant access, wrong bill) and is fixed in this task. **P1** = should be fixed before paid launch or the first real sandbox run. **P2** = later.

Context that shapes the ranking: real sandbox runs are switched off in code (`getRunDeps` returns null, `POST /api/runs` answers 503 `runner_unavailable`) until the `SandboxDriver` adapter exists (MANUAL_STEPS 5). Findings in the sandbox path are still P0 when the code that ships would be unsafe the day the adapter is plugged in.

## P0 (all fixed)

### P0-1 Any signed-in user could take over a stranger's fresh GitHub installation (cross-tenant)
- **Where:** `src/lib/github/sync.ts:132` `claimInstallations`, called by `src/app/api/github/setup/route.ts`.
- **Failure:** the setup redirect's `installation_id` was accepted for any unclaimed installation updated in the last 15 minutes. GitHub does not sign that redirect and installation ids are sequential. An attacker signed in to Stepclimb loops `GET /api/github/setup?installation_id=N..N+50`; the next customer who installs the app (before their own redirect lands, or if they never finish sign in) has the installation, all its private repos, free scans (composer.json and lock contents) and work orders (PRs on their repo) bound to the attacker's account. `updatedAt` also moved on every installation webhook, so "fresh" was not limited to new installs. An organisation installation could also be claimed by a user whose login matched the org name after a rename.
- **Fix:** an installation is linked only with proof from GitHub: the id must be listed by `GET /user/installations` for the user's own GitHub sign in token (`userInstallationIds`, via Better Auth `getAccessToken`), or it is a personal (`User`) installation whose account login equals the user's GitHub login. Users without GitHub sign in are sent to `/app?installed=1&link=github`, which explains the step. Tests: `review.test.ts` "a guessed fresh installation id...", `github.test.ts` updated.

### P0-2 The sandbox chose the branch and the commit that got the green "Verified" check
- **Where:** `src/lib/runs/service.ts:175` (`pushed` event), `:223` (finalize), `src/lib/runs/autopilot-finalize.ts`.
- **Failure:** customer code runs in the sandbox next to the agent and `EVENT_SECRET` (env of the agent process), so a malicious dependency or composer script can sign events. The orchestrator stored `branch` and `headSha` from the `pushed` event and then (a) opened the PR with `head: run.branch` and (b) created the check run "Stepclimb by BufferSol · Verified" on `run.headSha`. A forged `headSha` of any commit, for example the tip of another PR, puts a green Verified check there and can satisfy a required status check, bypassing the customer's branch protection. A forged branch (`main`) made the run look "delivered", so no credit came back.
- **Fix:** `expectedBranch(run)` is computed on our side (`stepclimb/laravel-<to>-<id>`, `stepclimb/autopilot`, `stepclimb/noop-<id>`); a push report for any other name, or for the base branch, fails the run and refunds. The check run goes on the head GitHub reports for our branch (`host.branchHead`), never on a sandbox sha; no pushed branch means no PR. Events are validated with a strict zod schema after the signature check (`RunnerEventSchema`), malformed events answer 400 `invalid_event`. Tests: four in `review.test.ts` "P0-2".

### P0-3 Untrusted text went into the customer's PR as live markdown
- **Where:** `src/lib/runs/work-order.ts:44` `buildWorkOrderBody`, `reviewComments`, autopilot body.
- **Failure:** squawk titles and bodies carry test and composer output (excerpts of whatever the repo or a dependency prints) and, given P0-2, can be fully forged. They were pasted into the PR body, the check run text and line comments under our app's name: `@mentions` and team pings, raw HTML (`<img>` tracking pixels, a closing `</details>`), phishing links, fence break outs (a ```` ``` ```` in the prompt), secrets the sandbox failed to redact, and `../` paths for review comments.
- **Fix:** `sanitizeResult` runs on every result before anything is stored or posted: mentions get a zero width space, `<` is escaped outside code fences, images become text, links survive only for `laravel.com`, `github.com`, `php.net`, `packagist.org` and our host, secrets are redacted again on our side, identifiers and paths are allow listed (no `..`, no absolute paths), sizes and counts are capped, unclosed fences are closed and the agent prompt fence is longer than any backtick run inside it. Tests: "P0-3" in `review.test.ts`.

### P0-4 Admin pages were protected by the layout only
- **Where:** `src/app/admin/layout.tsx` (only check), pages `src/app/admin/page.tsx`, `runs/page.tsx`, `runs/[id]/page.tsx`, `rules/page.tsx`.
- **Failure:** Next renders only the changed segments on client navigation; a request carrying a crafted router state can ask for the page segment without re-running the layout. The run inspector shows every customer's repo names, logs, squawks and credits. The TOTP rule (production) was also only in the layout.
- **Fix:** `requireFounderPage()` (`src/lib/auth/session.ts:96`) at the top of every admin page: 404 for non founders and for founders without TOTP in production. Test: "P0-4" checks each page calls it first.

### P0-5 The sandbox token could write to the default branch
- **Where:** `src/lib/runs/git-host.ts:37` `RUN_TOKEN_PERMISSIONS`, `src/lib/runs/sandbox-runner.ts:40` injection rule.
- **Failure:** the token is injected by the platform for every request to `github.com`, so any process in the VM (a test, a composer script, a dependency) could use it, and it carried `contents: write`. A malicious package could push to `main` or rewrite tags of the customer's repo during a Stepclimb run. Keeping the token outside the VM does not help when the VM can use it.
- **Fix:** the sandbox token is now `contents: read` (clone only). Pushing moves to the orchestrator (D-35): the agent hands its commits back (git bundle over the signed callback) and the orchestrator pushes only `refs/heads/<expectedBranch>` with the write token, never force except `stepclimb/autopilot`. This is a contract for the `SandboxDriver` adapter, which does not exist yet (real runs answer 503), so nothing customer facing regressed; the adapter cannot ship without it (LAUNCH.md gate, MANUAL_STEPS 5). Test: "the token handed to the sandbox cannot write".

## P1

| # | Finding | Where | Failure | Status |
|---|---|---|---|---|
| P1-1 | Credit double spend | `src/lib/runs/store.ts:103` `consumeCredit` | read, then `remaining - 1`: two parallel starts (two tabs, a catch up chain plus a click) both get the same credit, one run unpaid | **Fixed**: unique claim insert per spend (`credit_claims`), retry; test "two parallel starts cannot spend the same credit" |
| P1-2 | "Logs are kept 30 days" was not true | security page, home | no job deleted `run_logs` | **Fixed**: `purgeOldLogs` + nightly `retention` cron (`wrangler.toml` DAILY_JOBS); test added |
| P1-3 | Public claims not backed by code | home FAQ and bento, `docs/concepts`, compare ai-agents, security page | "check shows the test counts" (it lists stages only), "tokens expire after the run" (they live one hour), "inspection reads composer.json and composer.lock only" (it also reads package.json and the file list), compare row cited a Laravel Daily review not in `docs/brief.md` | **Fixed** wording; the FAQ answer that mentions the Laravel Daily report stays because it is labelled "third party observation"; add its source to the brief (P2-6) |
| P1-4 | Test switches could open production | `E2E_OUTBOX`, `GITHUB_FIXTURES` | set by mistake on Vercel they open `/api/dev/grant-credit` (free credits), turn off rate limits, ALTCHA and founder TOTP, and swap in the fake runner | **Fixed**: `e2eMode()` and `fixturesMode()` in `src/lib/env.ts` are false when `VERCEL_ENV=production` |
| P1-5 | `appPath` unvalidated | `src/app/api/runs/route.ts:17` | `../` or absolute paths reached the agent and the sandbox env | **Fixed**: regex, no `..`, no leading `/` |
| P1-6 | Event secret readable by customer code | `src/lib/runs/sandbox-runner.ts:45` | `EVENT_SECRET` is in the agent env, inherited by composer and test processes: they can forge `verified: true` for our own branch (after the P0 fixes the blast radius is the run's own PR and check) | **Open, adapter requirement**: the agent reads the secret, removes it from its env and runs customer commands as a separate user with a scrubbed env (MANUAL_STEPS 5) |
| P1-7 | Egress allow list includes `github.com` with the injected token for all paths | `sandbox-runner.ts:40` | with a read token this is a read of the same repo only; still allows `git clone` of other repos the installation can see | **Open, adapter**: inject only for `/<owner>/<repo>.git/` paths if the platform supports path rules, else accept (read only, same installation) |
| P1-8 | Health route did not check the database | `src/app/api/health/route.ts` | Mongo outage still answered `ok: true` | **Fixed**: 2 s DB read, 503 when it fails |
| P1-9 | e2e mail outbox per module instance | `src/lib/mail/transports.ts` | the magic link e2e failed whenever another spec loaded a page first (Next loads the module per bundle) | **Fixed**: process wide outbox |
| P1-10 | Accessibility (axe, real tokens) | header and footer brand links, sample Hangar table, breadcrumbs and small buttons | `label-content-name-mismatch` (aria-label hid the visible lockup text), `scrollable-region-focusable`, 32 px targets (`min-h-8`) | **Fixed**; `tests/e2e/a11y.spec.ts` gates 7 pages in light and dark plus 375 px targets and the skip link |
| P1-11 | A Stripe refund of a credit purchase does not take the credit back | `src/lib/billing/webhook.ts` `charge.refunded` | refunded outside the admin tool (dashboard, dispute), the unused credit stays spendable | **Fixed**: credits store `paymentIntentId`; a full refund revokes the unspent credit through the same unique claim as a spend and no longer cancels the customer's subscription; a refund that arrives before `checkout.session.completed` is remembered (`refunded_payments`) so the late grant is skipped; `checkout.session.async_payment_succeeded` also grants. Tests: `hardening.test.ts` |
| P1-12 | Free tier is per Stepclimb account | `src/lib/runs/free-tier.ts` | uninstall and reinstall into a new account gives another free PR that month | **Fixed**: runs store `ownerLogin`; the month is counted per account and per GitHub owner. Test: `hardening.test.ts` |

**P1 status:** P1-6 and P1-7 stay open on purpose: both are requirements for the `SandboxDriver` adapter, which does not exist (real runs answer 503), so no code in this repo can close them. They block the first real sandbox run (MANUAL_STEPS 5).

### Launch hardening pass (2026-11-10)
- Stripe webhook re-read for out-of-order and duplicate delivery: events are recorded only after success, every subscription and invoice event recomputes from Stripe, unknown event types answer 200 and are logged, checkout success never depends on the redirect (the credit is granted by the webhook). Fixed the two real gaps above (refund of a credit, early refund).
- Mail: magic link, invitations and founder alerts used `sendMail` directly, so a Resend rejection (bad address, 429) threw out of the auth handler or the alert loop. They now go through `sendMailSafe` (logs the status only, never the provider text, never throws). Run, receipt and weekly mail already swallowed failures.

### Battle hardening pass (2026-11-12)
- **Usefulness:** the Hangar exports as CSV (`GET /api/repos/export`, button "Export CSV"): one row per airframe, UTF-8 with BOM for Excel, spreadsheet formulas defused, own organisation only, rate limited. This is what Agency Alex hands to the account manager.
- **Abuse controls:** signed webhooks (Stripe, GitHub, Resend) have a per IP flood guard (300 a minute, fails open if the limiter is down); member invitations are limited to 3 per address and 30 per IP per hour (no mail bombing a victim); no-op probe closed (P2-1).
- **Operations:** `/api/health` now returns `deps` (db ok/down, billing and mail configured/missing) and the DB latency, without hostnames, keys or error text; only the DB sets the status code. The Hangar no longer queries once per repo (`latestScans`, one query).
- **Secrets:** `npm run scan:bundle` scans `.next/static` for key shapes and the live values of secret env vars; run clean on this build.
- **CSP:** a real browser run records every `securitypolicyviolation` on 7 public and 9 app pages: none, except a bundled `is-generator-function` probe on `/sign-in` that is refused by design and caught in a `try`.
- Tests: `tests/unit/battle.test.ts` (CSV, one query list, refund once, invite and webhook limits, Stripe bad signature, bundle scan) and `tests/e2e/qa/battle.spec.ts` (CSP, CSV tenant isolation, health, revoked session, hostile input, cross-site POST).

## P2

| # | Finding | Where | Note |
|---|---|---|---|
| P2-1 | `kind: "noop"` is open to every user and costs nothing | `src/app/api/runs/route.ts` | **Done** (2026-11-12 hardening pass): founder only, 403 for everyone else. Test: `battle.spec.ts` |
| P2-2 | **Open, one line:** touching the GitHub-facing sanitizer risks the P0 fixes for a cosmetic gain. Squawks are stored sanitized, so the run page shows `&lt;` where output had `<` outside fences | `service.ts` finalize | cosmetic; store the redacted raw text for the UI and sanitize only for GitHub |
| P2-3 | `refundCredit` is read then write | `store.ts` | **Done**: one unique claim `<credit>:refund:<spent>` per spend. Test: `battle.test.ts` |
| P2-4 | **Open, one line:** needs a counters collection and a migration; irrelevant below a few hundred runs a day. Global and per account concurrency are counted by reading all runs | `service.ts` startRun | fine at launch volume; becomes slow and racy at scale (use counters) |
| P2-5 | **Open, one line:** cannot be verified without the real GitHub App (MANUAL_STEPS 1). Installation tokens are not revoked at the end of a run | `git-host.ts` | they expire within an hour (claim now says so); `DELETE /installation/token` after finalize would shorten it |
| P2-6 | **Open, one line:** the brief names the review but has no URL and there is no internet here; the FAQ labels it third party. The Laravel Daily observation in the compare FAQ has no source line in `docs/brief.md` | `src/content/compare.ts:87` | add the URL and date to the brief sources or drop the answer |
| P2-7 | Lint warnings (5, pre-existing) | `.github/claude/run.mjs`, engine tests, `auth/client.ts` | **Done** for 4 (unused imports and variable removed, intentional full reload documented); the `.github/claude/run.mjs` one stays: that directory is off limits to feature tasks |

## Reviewed and found sound
- GitHub webhook: HMAC over the raw body, constant time, delivery id dedupe recorded after apply, 5 MB cap (`src/lib/github/webhook.ts`).
- Stripe webhook: signature on the raw body, event id recorded after success, other apps' customers ignored, credits idempotent per Checkout session, entitlement always recomputed from Stripe (no client flag grants a plan), credit kind and price come from our catalogue (`credit-checkout.ts`).
- Runner events: per run secret, sequence numbers reject replays and reordering, terminal runs accept nothing.
- IDOR: every run, repo, scan, credit and autopilot route and page checks `accountId === ctx.org.id`; admin API routes use `requireFounder` (TOTP in production).
- Manifest callback: founder only, signed state, one time, credentials encrypted.
- CSRF: `withApi` checks Origin on non GET; signed webhooks are the only exemptions. Cron: bearer `CRON_SECRET`, constant time.
- Unsubscribe: HMAC token per address and scope, GET only asks, POST acts; suppression applies to every category.
- Never auto merge, never push to the default branch from our side, repair loop capped at 3 (5 extended), wall clock 25 min with the reaper as backstop, partial runs become a draft PR marked timed out.
- No LLM host in the egress list (test), no ads, `npm run deny` in CI.

## Not verified here
- Real sandbox behaviour (egress blocking, snapshot, teardown) and real GitHub calls: need the adapter and the GitHub App (MANUAL_STEPS 1 and 5).
- Lighthouse 90+: not run in this environment (no network for the CLI); listed in LAUNCH.md.

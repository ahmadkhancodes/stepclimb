# ARCHITECTURE: Stepclimb by BufferSol on Vercel + MongoDB Atlas + Stripe + the kit

Scope: every P0 in `docs/brief.md` (12 items). Vercel first, always-on parts behind interfaces so they move to the owner's VPS later. Date: 5 Nov 2026.

## 1. Spike result: Vercel Sandbox can run upgrade runs (verified 5 Nov 2026)
Run with the new account token (`VERCEL_TOKEN_NEW_ACCOUNT`, team `ahmad-code`, project `stepclimb`) and `@vercel/sandbox`:

| Check | Result |
|---|---|
| Create sandbox, 4 vCPU, 8 GB RAM, 64 GB disk, Ubuntu 26.04, Node 24 | 329 ms |
| `apt-get install php-cli php-mbstring php-xml php-zip php-curl php-bcmath php-intl php-sqlite3` | PHP 8.5.4 in about 15 s (root via `sudo: true`) |
| Composer 2.11.1 from getcomposer.org | works, under 1 s |
| `composer create-project laravel/laravel` (Laravel 13.40) + `php artisan test` | 5 s install, 2 tests passed |
| Egress to repo.packagist.org and github.com | HTTP 200 |
| PHP 8.2 to 8.4 via `ppa:ondrej/php` | NOT available for Ubuntu 26.04 ("resolute" has no Release file); the PPA notice points to `packages.sury.org/php` instead |
| Static PHP CLI builds (`dl.static-php.dev`) | reachable; listed 8.4.8 and 8.5.x, 8.2/8.3 not confirmed |

Conclusions and risk handling:
- 8 GB RAM matches the brief's per run limit. Wall clock is enforced by us (25 min).
- Laravel 10 to 11 and 11 to 12 targets need PHP 8.2 to 8.4. Plan: a **runner snapshot** (`stepclimb-runner-vN`) built weekly, holding PHP 8.2, 8.3, 8.4, 8.5 from `packages.sury.org` (fallback: static-php-cli binaries, or building from source in the snapshot job), Composer, Node 24, Rector, rector-laravel, php-parser scripts, Pint, Larastan and the run agent. Runs create the sandbox from the snapshot (boot in seconds, no per run apt install). Snapshot build is an M2 spike gate: if sury fails on 26.04, use `--image` with a Debian or Ubuntu LTS base that sury supports.
- The Vercel MCP connector in this session points at the older account (team `muhammad-ahmad-khans-projects`), not the SaaS account. All Stepclimb Vercel work uses the token with REST or CLI (logged as D-02).

## 2. System overview

```
 Browser ─ Next.js (Vercel functions + static marketing)
   │           │
   │           ├─ Better Auth (GitHub OAuth, TOTP) ─ MongoDB Atlas (db stepclimb)
   │           ├─ Stripe Checkout / Portal / webhook
   │           └─ Mailer interface ─ provider adapter now, own MTA on VPS later
   │
 GitHub ── App webhooks ─▶ /api/github/webhook ─▶ job queue (Mongo, leased)
                                                    │
 Vercel Cron / Cloudflare cron worker ─▶ /api/cron/* ┤ (workers drain jobs)
                                                    ▼
                        RunnerBackend interface
                           ├─ VercelSandboxRunner  (now)
                           └─ VpsDockerRunner      (later, same contract)
                                 │ signed events ▲
                                 ▼               │
                         microVM sandbox: clone → recipes → composer → build → tests → repair → push branch
                                 │
                       orchestrator functions: create PR, check run, squawk comments, emails, invoices
```

### What runs where
| Piece | Runs on | Notes |
|---|---|---|
| Web app, API, webhooks, auth, billing, admin | Vercel functions (Next.js App Router, Node runtime, Fluid compute) | all stateless; Mongo is the state |
| Repo scan (free inspection) | Vercel function | GitHub API only: fetch `composer.json`, `composer.lock`, `package.json`, tree for sub paths. No clone. p95 target under 20 s |
| Job queue | MongoDB (`jobs` with lease + visibility timeout) behind `JobQueue` interface | drained by cron ticks and by `after()` kicks from webhooks; swap for Redis/Horizon style on the VPS |
| Schedulers | Cloudflare Worker cron (every minute) calling `/api/cron/<job>` with `CRON_SECRET`; Vercel Cron as daily backstop | Hobby allows 1 cron a day, so the worker is the primary. Pro allows per minute |
| Upgrade runs | **Vercel Sandbox** microVM from the runner snapshot, driven through `RunnerBackend` | see section 5 |
| Fixture regression suite (recipes and repair rules) | GitHub Actions on `ahmadkhancodes/stepclimb` using the same runner image recipe | blocks deploys on golden diff drift; sandbox not used in CI to avoid spend |
| Files (logs, PDFs, reports) | Cloudflare R2 (own account) behind `ObjectStore` | until the key exists, Mongo GridFS stub in dev |
| Email | kit `Mailer`: provider adapter (Resend key pending), console adapter in dev, SMTP/Postfix adapter later | |
| Backups | nightly cron exports critical collections to R2 (the free M0 cluster has no backups) | restore drill script in `scripts/restore-drill.ts` |
| Monitoring | `/api/health`, cron heartbeat collection, alert email to founder when a heartbeat is older than 2 min or an error spike appears | replaces Prometheus/Alertmanager until the VPS |

### Interfaces for the move to the VPS (each has a contract test)
`RunnerBackend`, `JobQueue`, `Scheduler`, `ObjectStore`, `Mailer`, `BillingProvider`, `GitHost` (GitHub now, GitLab and Bitbucket v1/v2), `Db` (kit Mongo/memory). The runner contract is: `start(runSpec) -> handle`, signed event stream back (`started`, `step`, `log_chunk`, `pushed`, `result`), `cancel(handle)`, hard limits (wall clock, RAM, egress allow list). The VPS runner implements the same contract with Docker + gVisor/Firecracker and our own Satis and Verdaccio mirrors.

## 3. The GitHub App
- Created through a **manifest flow** (see `docs/MANUAL_STEPS.md`, one click for the owner). Manifest in `docs/manifests/github-app.json`, generated at runtime from the deployment origin by `/setup/github-app`.
- Permissions (least privilege, as the brief): contents read and write, pull requests read and write, checks read and write, metadata read. Events: `pull_request`, `push`, `issue_comment` (for `/stepclimb rerun`, v1), `check_run`, plus the always sent `installation` and `installation_repositories`.
- On manifest conversion the callback stores `app_id`, private key (PEM), webhook secret and client id/secret **encrypted in Mongo** (libsodium secretbox, key from `APP_ENCRYPTION_KEY`), so there is nothing to paste into env vars. A one time setup guard refuses to overwrite.
- Webhook endpoint: verify `X-Hub-Signature-256` on the raw body, write `webhook_events` (unique delivery id) and acknowledge in under 10 s; work happens in jobs. Idempotent.
- Installation tokens: minted per run, scoped to the one repo with the minimum permissions, 1 hour life, never written to disk and, with Vercel's network policy header injection, never present inside the sandbox (section 5).
- Checks: one check run per work order, "Stepclimb by BufferSol · Verified", conclusion success, failure or neutral. Rate limit aware (5,000 req/hr per installation, backoff on secondary limits, conditional requests with ETags).
- Suspension risk: PRs only on opted in repos, one open PR per hop per repo, clear PR body, respect rate limits.

## 4. Data model (MongoDB, db `stepclimb`, user `stepclimb-app` readWrite on it only)
ULID `_id` strings, `createdAt` and `updatedAt` `Date` fields on every document, TTL fields are `Date` (kit rule). Names map the brief's Postgres tables.

| Collection | Key fields | Indexes |
|---|---|---|
| `accounts` | name, slug, plan (free, solo, legacy_solo, studio, legacy_studio, agency), stripeCustomerId, stripeSubscriptionId, taxId, taxCountry, entitlements{}, extendedVerifyQuota/Used | slug unique; stripeCustomerId |
| `users` (Better Auth) | githubId unique, email, name, avatarUrl, githubCreatedAt, totp | githubId unique |
| `memberships` | accountId, userId, role owner/admin/member | accountId+userId unique |
| `installations` | accountId, provider, externalId, accountLogin, suspendedAt | provider+externalId unique |
| `repos` | installationId, fullName, defaultBranch, private, timezone, autopilotWeekly, autopilotMonthly, quietMode, pushedAt, archived | installationId+fullName unique; accountId+pushedAt |
| `apps` | repoId, path, laravelVersion, phpConstraint, targetVersion, frontendStack, tailwindVersion, livewireVersion, testFramework, supported | repoId+path unique; accountId+laravelVersion |
| `scans` | appId, reportJson, effortBand S/M/L/XL, eolDate, riskFlags[], manifestShas | appId+createdAt desc |
| `recipes` | pathKind, fromVersion, toVersion, key, version, engine, yaml | key+version unique |
| `runs` | appId, accountId, kind, status, hop, startedAt, finishedAt, branch, prNumber, prUrl, checkConclusion, repairPasses, repairRulesApplied[], computeSeconds, sandboxId, leaseUntil, creditId | accountId+createdAt; status+leaseUntil |
| `run_steps` | runId, seq, name, status, logKey, durationMs | runId+seq |
| `run_recipes` | runId, recipeId, commitSha, filesChanged | runId |
| `squawks` | runId, severity, file, line, title, bodyMd, agentPrompt, resolvedBy | runId |
| `credits` | accountId, kind, remaining, expiresAt (Date), stripePaymentId | accountId+expiresAt |
| `secrets` | repoId, name, ciphertext (libsodium) | repoId+name unique (v1 use) |
| `reports` | accountId, scope, pdfKey, period | accountId |
| `repair_rules` | key, category, signatureRegex, contextGuard, fixKind, version, hits, lastHitAt | key+version unique |
| `unmatched_signatures` | signature unique, sampleOutput, count, firstSeen, lastSeen | signature unique |
| `invoices` | accountId, number unique, stripeChargeId, amountUsd, taxId, pdfKey | number unique |
| `email_messages`, `mail_suppressions` | kit | message id unique; email PK |
| `webhook_events` | provider, eventId unique, payload, processedAt | provider+eventId unique |
| `eol_calendar` | product, version, securityUntil, source, checkedAt | product+version unique |
| `jobs`, `heartbeats`, `audit_log`, `rate_limits`, `api_keys`, `outbound_webhook_*` | kit | per kit |

## 5. Upgrade run pipeline (Vercel Sandbox)
1. **Start** (`POST /api/runs`, plan and credit check, idempotency key). Create `runs` row (`queued`), reserve a credit or confirm entitlement, enqueue.
2. **Dispatch** (job). Mint a repo scoped installation token. Create the sandbox from the runner snapshot with `resources {vcpus: 4}` (8 GB), `timeout` 25 min plus 5 min, `networkPolicy` custom: allow `github.com`, `api.github.com`, `codeload.github.com`, `objects.githubusercontent.com`, `repo.packagist.org`, `packagist.org`, `registry.npmjs.org` (and the callback host); `injectionRules` for `github.com` add the Basic auth header built from the installation token, so `git clone` and `git push` work and the token never exists inside the VM. Start the run agent as a **detached** command; the function returns.
3. **Run agent** (TypeScript, in the snapshot) executes: shallow clone → detect → for each recipe in the plan: apply, commit (one commit per recipe, message `Stepclimb: <recipe key>@<version>`) → `composer update` with a rewritten constraint and lockfile → skeleton and config 3 way diff against the tagged `laravel/laravel` (`git merge-file`; conflicts become squawks) → `npm ci` + Vite build → Pest or PHPUnit → on failure, repair loop (up to 3, 5 with extended verify): match output against `repair_rules`, apply deterministic fix as a separate `Repair: <rule keys>` commit, re-verify. Secrets redacted from logs (regex + entropy). Push branch `stepclimb/<hop>-<runId>`.
4. **Events** back to `POST /api/runner/events`, HMAC signed with a per run secret (replay protected by sequence number), updating `run_steps`, streaming `log_chunk` to R2 and the UI (SSE polling now, WebSocket on the VPS).
5. **Finalize** (function, not the sandbox): create the PR with the Work Order body (summary, recipes, verification, squawk index, stamp SVG), post squawk review comments on exact lines with severity, create the check run (`success`, `failure`, `neutral` for Unverified), email the user, write `invoices` if billable, destroy the sandbox in a `finally` path.
6. **Watchdog** (`/api/cron/reap`, every minute): any run past 25 min wall clock is stopped; a draft PR "timed out" with the recipes applied so far is opened from the pushed branch; leaked sandboxes are listed and stopped; stuck `leaseUntil` jobs are re queued. Resource guard kills runs with sustained abnormal CPU and no output (crypto mining profile).
7. **Retention**: nothing of the customer repo persists after the sandbox stops; logs 30 days (R2 lifecycle + nightly purge job).

Limits enforced: 25 min wall clock, 8 GB RAM, egress allow list with denied hosts logged to `run_steps` as `blocked_host`, no host mounts (Sandbox provides). Audit test: after a run, list of sandboxes for the project contains none in `running` state, and a fixture run proves no file written by a run is readable from the next sandbox (fresh microVM each time).

Concurrency and cost guard: global and per account concurrency limits (config), queue priority for Agency, per account monthly compute cap, spend alarm email at 80% of a configured budget (Sandbox is billed on active CPU and memory; the unit price is read from the Vercel pricing page at M2 and put into `docs/DECISIONS.md`).

## 6. P0 map: how each is built, routes, and acceptance
Notation: **A** = adapted acceptance for Vercel; **AC** = brief acceptance criteria kept.

### P0-1 Own infrastructure base (FR-48, 49) → Vercel + Atlas + Cloudflare, VPS later
- Build: Vercel project `stepclimb`, Atlas db and user, Cloudflare cron worker (`infra/cron-worker/`), R2 bucket, `/api/health`, `heartbeats`, structured logger, error boundary, nightly export to R2 and a restore drill script.
- Routes: `GET /api/health`, `GET /api/cron/[job]`.
- A: a forced exception, a missed cron heartbeat and a stuck sandbox each send an alert email to the founder within 2 minutes (cron worker runs every minute and checks heartbeats). Monthly restore drill restores the nightly export into a scratch database with matching document counts.
- Deferred to VPS: Postgres hot standby, Forgejo CI, Prometheus/Grafana, own MTA warm up (interfaces exist).

### P0-2 Auth (FR-01, 02)
- Build: Better Auth with the GitHub social provider as the only sign in at MVP (ties users to installations), optional TOTP, accounts and memberships with Owner, Admin, Member.
- Routes: `/api/auth/*`, `/login`, `/app/settings/security`, `/app/team`.
- AC: a new user sees installed repos within 60 s (install webhook plus a sync job on first login). Only Owner or Admin change billing (server checks on every billing route; tested).

### P0-3 Repo detection and fleet (FR-04, 05)
- Build: `detectApp()` parses composer.json/lock (Laravel version from lock, PHP constraint, packages), package.json (Vite, Tailwind), detects Livewire or Inertia (Vue/React), Pest/PHPUnit, monorepo sub paths via the git tree. Fleet table with server side pagination and filters; EOL chips; runway bars.
- Routes: `GET /app/hangar`, `GET /api/repos`, `POST /api/repos/:id/scan`.
- AC: correct on 50 fixture repos (snapshot test of `detectApp` over committed fixtures); 500 repos load in under 1.5 s (indexed query, 50 per page, count cached; seeded benchmark in CI).

### P0-4 Free scan (FR-06, 52)
- Build: scan job reads manifests via GitHub contents API, produces `report_json` (versions behind, EOL date from `eol_calendar`, applicable recipes, effort band, risk flags), public share link for the report. Laravel release watcher cron (hourly) polls `laravel/framework` and `laravel/laravel` releases with ETag; EOL calendar from `data/eol.json` (human reviewed monthly diff).
- Routes: `GET /app/inspections/:id`, `GET /r/:token` (shareable report), `POST /api/scan`, `GET /api/cron/release-watch`.
- AC: a new Laravel tag on a replayed feed is detected within 1 h (replay test with recorded feed); scan p95 under 20 s on fixtures; the page states "reads composer.json and composer.lock only".

### P0-5 Sandboxed runs (FR-09 to 15)
- Build: section 5. `RunnerBackend` + `VercelSandboxRunner`, run agent, event ingestion, watchdog, limits.
- Routes: `POST /api/runs`, `GET /app/work-orders/:id`, `POST /api/runner/events`, `GET /api/cron/reap`.
- AC: no filesystem or process survives (audit test over two consecutive runs); a run over the limit opens a draft PR marked "timed out"; blocked hosts are logged; 25 min and 8 GB enforced.

### P0-6 Upgrade recipes (FR-24, 25)
- Build: `recipes/<path>/<from>-<to>/recipe.yaml` with `engine` (composer_json, skeleton_diff, rector, php_parser, npm_codemod), version, guards, golden fixtures. Hops 10 to 11, 11 to 12, 12 to 13 including skeleton and config diffs, PHP minimum bump, first party package bumps. Laravel Fixer conventions for 12.x and 13.x (Pint config recipe).
- AC: PR passes tests in 75 percent or more of 20 fixture apps per hop with no human edits; Fixer passes on 15 of 20. Fixture apps are open source Laravel apps and generated skeleton apps; the regression workflow reports the rate, and a drop blocks deploy.

### P0-7 Rule based repair pass (FR-17, 18)
- Build: `repair-rules/*.yaml` (category composer, larastan, php, tests, build; signature regex, context guard, fix kind). Loop max 3. Every unresolved squawk gets a templated agent ready prompt (file paths, failing output, upgrade guide link). No AI call anywhere; CI denylist and egress allow list enforce it.
- AC: no network call leaves our servers during repair (egress audit test); the loop stops after 3 or when no rule matches; unmatched signatures are recorded for weekly review.

### P0-8 PR delivery (FR-20, 21, 22)
- Build: Work Order PR body generator (markdown + stamp SVG data), squawk review comments on exact lines with Must fix, Review, Note, check run. No tests means amber "Unverified" and a `neutral` conclusion.
- AC: PR shows summary, recipes, verification, squawk index; check conclusion matches test result; a repo without tests gets the Unverified stamp.

### P0-9 Autopilot (FR-34)
- Build: weekly grouped dependency PR per repo, verified, refreshes an open PR instead of duplicating; schedule Monday 06:00 in the repo timezone (default America/New_York), driven by an hourly cron selecting repos whose local time is in the window; quiet mode after 3 closed PRs in a row (suggested, not forced).
- Routes: `GET /api/cron/autopilot`, repo settings toggles.
- AC: two consecutive weeks produce one refreshed PR, not two; the schedule respects timezone and DST (unit tests).

### P0-10 Billing (FR-37 to 40)
- Build: kit Stripe billing behind `BillingProvider`. Products and prices exactly per the brief with `metadata.app=stepclimb` and lookup keys `stepclimb_<plan>_<interval>`: Solo $49/yr, Legacy Solo $74/6 mo, Studio $449/yr, Legacy Studio $474/6 mo, Agency $99/mo and $999/yr, one time credits (13.x $9.99, 12.x $14.99, older $19.99, side task $9.99, converters $4.99, extended verify $4.99). Webhook recomputes entitlements within 30 s; invoices and receipts generated in house as PDF with UK VAT or Canadian GST IDs (Stripe tax id collection on Checkout, own numbering); limits enforced with an upgrade prompt, not an error; cancel at period end; pause up to 3 months (Stripe pause collection with resume date); GBP and CAD shown as estimates only.
- Routes: `/pricing`, `/app/billing`, `POST /api/billing/checkout`, `POST /api/billing/portal`, `POST /api/stripe/webhook`, `GET /app/billing/invoices/:id.pdf`.
- AC: webhook to entitlement under 30 s (test with replayed events); events recorded only after success (kit rule); full refund disables the plan; Stripe objects touched only when `metadata.app=stepclimb`.

### P0-11 Email (FR-42, 43)
- Build: kit `Mailer`; templates: run finished, PR opened, verification failed, EOL warning (weekly, under 90 days), new Laravel major; RFC 8058 one click List-Unsubscribe on non receipt mail; suppression list; bounce and complaint webhooks from the provider adapter.
- A: for now sends through the provider adapter (Resend key pending; console adapter until then). Inbox placement tests and own Postfix/OpenDKIM/VERP move to the VPS phase; DKIM, SPF and DMARC are set on the sending domain in the provider.
- AC: hard bounces suppressed within 1 minute of the webhook (test); unsubscribe link works; subjects match the brief ("Work order #4821 · acme/portal to Laravel 13 · Verified" style).

### P0-12 Abuse, security, admin (FR-50, 53, 54, 55)
- Build: free tier gating (GitHub account 30 days or older, 1 public repo PR per month), Mongo sliding window rate limits, ALTCHA on public forms, disposable domain blocklist, strict CSP and security headers, audit log. Internal `/admin` (founder only via `ADMIN_USER_IDS` + TOTP): run inspector, recipe and repair rule version pinning, refund tool, mail queue, feature flags per upgrade path. Secrets encrypted with libsodium; logs redacted. CI step `scripts/deny-deps.ts` fails the build on banned SDKs (`deny-npm.txt`).
- AC: free tier limits enforced and tested; denylist test fails on a planted banned package; admin actions audited; no customer code stored after a run.

## 7. Routes summary
Marketing: `/`, `/pricing`, `/security`, `/compare/laravelshift`, `/guides`, `/guides/[slug]`, `/laravel-[a]-to-[b]`, `/docs/[...slug]`, `/legal/*`, `/r/[token]`.
App: `/login`, `/app/hangar`, `/app/inspections/[id]`, `/app/work-orders`, `/app/work-orders/[id]`, `/app/recipes`, `/app/repos/[id]/settings`, `/app/billing`, `/app/team`, `/app/settings/*`.
API: `/api/auth/*`, `/api/github/webhook`, `/api/github/manifest/callback`, `/api/stripe/webhook`, `/api/scan`, `/api/repos`, `/api/runs`, `/api/runner/events`, `/api/billing/*`, `/api/cron/[job]`, `/api/health`, `/api/config`.
Setup: `/setup/github-app` (owner only, one time).

## 8. Security notes
- Customer code is executed (composer scripts, tests) only inside the microVM. Egress allow list limits exfiltration to package registries and GitHub; blocked attempts are logged. This is weaker than the brief's own mirror plus gVisor model, so the first release is labelled beta for agencies and the security page states the real controls (DECISIONS D-07).
- The sandbox gets no long lived secret. Run agent events use a per run HMAC secret that is useless after the run.
- Webhook signature checks on GitHub and Stripe; Origin/CSRF checks (kit); httpOnly `__Host-` cookies.
- Sub processors in this phase: Vercel (hosting, sandbox), MongoDB Atlas, Cloudflare (R2, cron), Stripe, the email provider. Listed on `/legal/subprocessors`.

## 9. Risks (ranked)
1. **Recipe quality without AI** (75 percent pass rate per hop is the product). Mitigation: fixture corpus first, golden diffs, honest Unverified and squawk model, free re runs.
2. **PHP version matrix inside the sandbox** (Ubuntu 26.04 lacks the ondrej PPA). Mitigation: snapshot with sury or static PHP, spike in M2 week 1.
3. **Vercel plan limits** (Hobby is non commercial; Sandbox concurrency and pricing; function duration). Mitigation: Pro before real money (manual step), concurrency caps, compute budget alarm.
4. **Free M0 cluster** (no backups, 512 MB). Mitigation: nightly export to R2, upgrade the cluster tier when paying customers arrive.
5. GitHub App suspension or rate limits. Mitigation: least privilege, opt in repos, ETags, backoff.

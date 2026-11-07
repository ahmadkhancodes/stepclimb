# Launch checklist: Stepclimb by BufferSol

Status on 7 Nov 2026 (M5 code done, not deployed). Tick in order; nothing below the line "public launch" happens before every item above it is done.
Security review and its fixes: `docs/REVIEW.md`. Owner actions with deep links: `docs/MANUAL_STEPS.md`.

## Code gates (done in the repo)
- [x] Pre-launch review written, every P0 fixed with a failing-first test (`tests/unit/review.test.ts`).
- [x] lint (0 errors), typecheck, unit tests, build, `npm run deny`, Playwright (functional specs plus `a11y.spec.ts`).
- [x] Fixture regression: 20 generated apps per hop (60 apps) through the real agent, recipes and repair rules with simulated Composer (`tests/unit/runs.test.ts` "fixture corpus pass rate"). Not a real world pass rate (D-24).
- [x] Design scorecard 44/50 (`docs/qa/design-scorecard.md`), screenshots `docs/qa/2026-11-07-m5/`.
- [x] Public claims checked against the code and `docs/brief.md`; "not affiliated with Laravel" line in the footer.
- [ ] 60 repair rules (30 today, half `unverified: true`, D-13). Not a launch blocker for the paid beta; keep the count off marketing pages.

## Before the first real (paid) run
- [ ] `SandboxDriver` adapter on `@vercel/sandbox` and the runner snapshot (MANUAL_STEPS 5.1, 5.2) built to the safety contract:
  - [ ] the sandbox token is read only (`RUN_TOKEN_PERMISSIONS`); commits come back as a bundle and the orchestrator pushes only `refs/heads/<expectedBranch>` (D-35), force push only for `stepclimb/autopilot`;
  - [ ] customer commands (composer, npm, tests) run as a separate user with an env that has no `EVENT_SECRET` (REVIEW P1-6);
  - [ ] egress audit on a real run: only the allow list plus the callback host answer, everything else is `blocked_host`;
  - [ ] sandbox destroyed on success, failure, timeout and cancel (check `listActive` after 20 runs).
- [ ] Real smoke test: private Laravel 12 repo, scan, pay $9.99 in Stripe test mode, verified PR opens on `stepclimb/laravel-13-*`, check run on that branch head, nothing pushed to the default branch.
- [ ] Regression on real open source Laravel apps in the sandbox; publish a pass rate only from these runs.

## Infrastructure
- [ ] GitHub App created through `/setup/github-app` on the final host (MANUAL_STEPS 1); `pull_request` event ticked.
- [ ] Mongo: `MONGODB_URI`, `MONGODB_DB=stepclimb`, `npm run db:indexes`, remove `DB_DRIVER=memory`.
- [ ] Stripe webhook with `checkout.session.completed`, `invoice.paid`, subscription and `charge.refunded` events; `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`; Customer Portal configured.
- [ ] Resend key and bounce webhook (`MAIL_WEBHOOK_SECRET`), sending domain verified.
- [ ] Cloudflare cron worker deployed (`reap,heartbeat,alerts,webhook-retries` every minute, `autopilot` hourly, `backup,retention` daily).
- [ ] `E2E_OUTBOX` and `GITHUB_FIXTURES` are NOT set in Vercel (the code also refuses them when `VERCEL_ENV=production`).
- [ ] `ADMIN_EMAILS`, `ALERT_EMAILS`, `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `ALTCHA_HMAC_KEY`, `BETTER_AUTH_SECRET` (high entropy) set.
- [ ] Founder TOTP on before opening `/admin`.
- [ ] Vercel Pro (commercial use, cron and duration limits).
- [ ] DNS `stepclimb.buffersoltech.com`, `NEXT_PUBLIC_APP_URL` matches it.
- [ ] Backups to R2 (`BackupSink`) and one restore drill.

## Deploy and verify
- [ ] Deploy, then `scripts/vercel-keep-latest-3.sh stepclimb`.
- [ ] `/api/health` answers 200 with `dbOk: true`.
- [ ] Lighthouse 90+ on `/` (mobile), `/pricing`, `/security`.
- [ ] Magic link and GitHub sign in from a phone; ALTCHA solves under a second.
- [ ] Uptime check on `/api/health`; alert mail arrives (break the heartbeat once).

## Legal (owner)
- [ ] Trademark clearance and counsel check of the footer line (MANUAL_STEPS 4).
- [ ] Terms refund policy and legal placeholders filled.

---
## Public launch
- [ ] Every box above ticked.
- [ ] Beta onboarding: first 20 accounts by invite, watch `unmatched_signatures` and failed runs daily for two weeks.
- [ ] Report the launch line to the orchestrator.

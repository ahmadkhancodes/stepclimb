# Manual steps for Stepclimb (owner-only actions; deep link first)

Everything else is automated by the build session. Steps appear here only when they need a login, a confirmation or a console click. Nothing below blocks M1.

## 1. Create the GitHub App (one click flow, needed from M2)
Available once M1 is deployed, because the manifest uses the live host. The `/setup/github-app` page builds the manifest from the host it runs on and posts it to GitHub; the app then stores the credentials itself (encrypted), so nothing is pasted.

Prerequisites in the Vercel project env (set by the build session): `APP_ENCRYPTION_KEY` (the page refuses to submit without it) and `ADMIN_EMAILS` containing the founder's email (only that account can open the page; everyone else gets a 404).

Exact URL to open after deploy (production host, see `NEXT_PUBLIC_APP_URL`):
`https://stepclimb.vercel.app/setup/github-app` (becomes `https://stepclimb.buffersoltech.com/setup/github-app` once DNS is ready; the manifest uses `NEXT_PUBLIC_APP_URL`, so open the page on the host you want GitHub to call).

1. Sign in to Stepclimb with the founder email, open the link, then click **Create the Stepclimb GitHub App**. GitHub shows its confirmation page: click **Create GitHub App**.
2. Nothing to paste. GitHub redirects to `/api/github/manifest/callback`, which exchanges the code and stores app id, private key, webhook secret and OAuth client id/secret encrypted in the database. The page then shows "GitHub App connected" with an **Install on a repository** button. Setup is one time and never overwrites stored credentials.
3. Manifest values used (for review): name "Stepclimb by BufferSol", public app, webhook `{{HOST}}/api/github/webhook`, callback `{{HOST}}/api/auth/callback/github`, setup URL `{{HOST}}/api/github/setup`, permissions contents write, pull requests write, checks write, metadata read, events pull_request, push, issue_comment, check_run (`docs/manifests/github-app.json`).
4. Click **Install** on the target account; you land on the Hangar with the repos listed and can run a free scan on each.

Organisation owned alternative: use `https://github.com/organizations/{{ORG}}/settings/apps/new` as the form target; the page has a toggle.

## 2. Upgrade Vercel to Pro before real money
Hobby is non commercial and has tight cron and duration limits.
Link: https://vercel.com/ahmad-code/~/settings/billing
Click **Upgrade to Pro** and add the card. You will see the plan as Pro on that page. (Payment step, cannot be automated.)

## 3. Keys the build uses when they arrive (no action here, tracked only)
`STRIPE_SECRET_KEY_TEST`, `RESEND_API_KEY`, `CLOUDFLARE_SAAS_TOKEN`, `CLOUDFLARE_SAAS_ACCOUNT_ID` as environment variables. Until then: Stripe through the connector, console mailer, `*.vercel.app` host. When the Cloudflare token arrives the session creates the DNS record for `stepclimb.buffersoltech.com`, the R2 bucket and the cron worker itself.

## 4. Before public launch (legal, M5)
Formal trademark clearance for "Stepclimb" (USPTO, UKIPO, CIPO classes 9 and 42) and a counsel check of the "not affiliated with Laravel" footer line. Not a blocker for the build.

## 5. Turn on real runs (before the first paid run)
1. Add `@vercel/sandbox` (named in ARCHITECTURE.md) and write the `SandboxDriver` adapter **to the safety contract in docs/REVIEW.md (P0-5, P1-6) and D-35**: the sandbox token is read only, commits come back as a bundle and the orchestrator pushes only the expected `stepclimb/*` branch; customer commands run as a separate user without `EVENT_SECRET` in their env. Then write the adapter (`create`, `runDetached`, `stop`, `list`) next to `src/lib/runs/sandbox-runner.ts`; return it from `getRunDeps` in `src/lib/runs/runtime.ts` using `realTokens(creds)`. Until then `POST /api/runs` answers 503 `runner_unavailable` before any credit is taken.
2. Build the runner snapshot `stepclimb-runner-v1` (PHP 8.2 to 8.5 from packages.sury.org or static PHP, Composer, Node 24, Rector, Pint, the `stepclimb-agent` entrypoint). It needs the Vercel token (`VERCEL_TOKEN_NEW_ACCOUNT`) and Pro plan (item 2).
3. Stripe: create the webhook endpoint for `<host>/api/stripe/webhook` with `checkout.session.completed` included, so paid one time work orders grant their credit. Link: https://dashboard.stripe.com/test/webhooks
4. Cron: call `/api/cron/reap` every minute (Cloudflare worker with `CRON_SECRET`).
5. Mongo (when `MONGODB_URI` exists): run `npm run db:indexes` after adding indexes for `runs` (accountId+createdAt, status), `run_steps` (runId+seq), `run_logs` (runId+seq), `credits` (accountId+kind).


## 6. Turn on M4 pieces (autopilot, mail, backups, alerts)
1. **Cloudflare cron worker** (needs `CLOUDFLARE_SAAS_TOKEN`): `cd infra/cron-worker && npx wrangler secret put CRON_SECRET && npx wrangler deploy`. `wrangler.toml` now lists every minute jobs (`reap,heartbeat,alerts,webhook-retries`), `HOURLY_JOBS=autopilot` and `DAILY_JOBS=backup`. Without it only the two daily Vercel crons run and autopilot never fires.
2. **Resend webhook** (bounces and complaints): https://resend.com/webhooks. Add endpoint `<host>/api/mail/webhook` with events `email.bounced` and `email.complained`, copy the signing secret (`whsec_...`) into the Vercel env `MAIL_WEBHOOK_SECRET`. Until then hard bounces are not suppressed.
3. **Alert recipient**: set `ALERT_EMAILS` (or keep `ADMIN_EMAILS`) in Vercel. Alerts need `RESEND_API_KEY` to leave the console mailer.
4. **Founder two-factor**: the admin console at `/admin` refuses founder accounts without TOTP in production. Turn it on at `/app/settings/security` before first use.
5. **Backups to R2**: needs the R2 bucket (created with the Cloudflare token). Write an R2 `BackupSink` next to `backupSink()` in `src/lib/cron/jobs.ts` and set its keys; until then the nightly job records only a manifest (counts and checksum), which the admin overview shows as "manifest only". Run the drill monthly: `MONGODB_URI=... npx tsx scripts/backup.ts` then `npx tsx scripts/restore-drill.ts backups/<file>.json.gz backups/<file>.json.gz.sha256` (restores into a scratch database and drops it).
6. **Mongo indexes**: run `npm run db:indexes` again (new indexes for runs, credits, autopilot_state, webhook_failures).
7. **Real autopilot runs** need the same sandbox adapter as item 5.1: `RunEnv.updateDeps` must run `composer update --no-scripts` inside the constraints and `npm update`, and `push` must force push `stepclimb/autopilot` so a refresh moves the open PR.
8. **Stripe webhook events**: add `invoice.paid` to the endpoint (receipts for subscriptions) next to `checkout.session.completed`: https://dashboard.stripe.com/test/webhooks
9. **GitHub App events**: the app must receive `pull_request` events (closed autopilot PRs feed quiet mode). They are already in `docs/manifests/github-app.json`; apps created before M4 need the event ticked at the app's settings page.

## 7. Before launch (M5 review, 7 Nov 2026)
1. **Check the test switches are absent in Vercel**: https://vercel.com/ahmad-code/stepclimb/settings/environment-variables . `E2E_OUTBOX` and `GITHUB_FIXTURES` must not exist in Production or Preview. (The code also ignores them when `VERCEL_ENV=production`.)
2. **GitHub sign in is needed to link an organisation installation** (D-37). The GitHub App's OAuth credentials come from the manifest flow (item 1); nothing to paste. Tell beta users to sign in with GitHub.
3. **Daily retention job**: redeploy the Cloudflare worker after item 6.1 so `DAILY_JOBS=backup,retention` is live: `cd infra/cron-worker && npx wrangler deploy`.
4. **Lighthouse** on the deployed host (no network in the build session): https://pagespeed.web.dev/ with `https://stepclimb.buffersoltech.com/`, mobile; target 90+ in every category. Record the scores in `docs/LAUNCH.md`.
5. Work through `docs/LAUNCH.md` top to bottom.

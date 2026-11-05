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

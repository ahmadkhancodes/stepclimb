# Manual steps for Stepclimb (owner-only actions; deep link first)

Everything else is automated by the build session. Steps appear here only when they need a login, a confirmation or a console click. Nothing below blocks M1.

## 1. Create the GitHub App (one click flow, needed from M2)
Available once M1 is deployed, because the manifest uses the live host. The `/setup/github-app` page builds the manifest from the host it runs on and posts it to GitHub; the app then stores the credentials itself (encrypted), so nothing is pasted.

Deep link (host is filled in when M1 deploys; this file will be updated with the exact URL and the orchestrator will be told):
`https://{{STEPCLIMB_HOST}}/setup/github-app`

1. Open the link while signed in to GitHub as `ahmadkhancodes`, click **Create the Stepclimb GitHub App**, then **Create GitHub App** on the GitHub confirmation page.
2. Nothing to paste. Manifest values used (for review): name "Stepclimb by BufferSol", public app, webhook `{{HOST}}/api/github/webhook`, callback `{{HOST}}/api/auth/callback/github`, permissions contents write, pull requests write, checks write, metadata read, events pull_request, push, issue_comment, check_run (`docs/manifests/github-app.json`).
3. You will land on the app's Hangar page with "GitHub App connected". Then click **Install** on the target account to test.

Organisation owned alternative: use `https://github.com/organizations/{{ORG}}/settings/apps/new` as the form target; the page has a toggle.

## 2. Upgrade Vercel to Pro before real money
Hobby is non commercial and has tight cron and duration limits.
Link: https://vercel.com/ahmad-code/~/settings/billing
Click **Upgrade to Pro** and add the card. You will see the plan as Pro on that page. (Payment step, cannot be automated.)

## 3. Keys the build uses when they arrive (no action here, tracked only)
`STRIPE_SECRET_KEY_TEST`, `RESEND_API_KEY`, `CLOUDFLARE_SAAS_TOKEN`, `CLOUDFLARE_SAAS_ACCOUNT_ID` as environment variables. Until then: Stripe through the connector, console mailer, `*.vercel.app` host. When the Cloudflare token arrives the session creates the DNS record for `stepclimb.buffersoltech.com`, the R2 bucket and the cron worker itself.

## 4. Before public launch (legal, M5)
Formal trademark clearance for "Stepclimb" (USPTO, UKIPO, CIPO classes 9 and 42) and a counsel check of the "not affiliated with Laravel" footer line. Not a blocker for the build.

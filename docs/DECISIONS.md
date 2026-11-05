# Decisions

Standing decisions are in docs/factory/BATCH1_PLAN.md (Mongo instead of Postgres, Better Auth, Stripe first, Mailer interface, Vercel-first, keep 3 deployments).

| ID | Date | Decision | Why |
|---|---|---|---|
| D-01 | 5 Nov 2026 | Upgrade runs execute in Vercel Sandbox microVMs created from a prebuilt runner snapshot, behind a `RunnerBackend` interface. | Spike passed (PHP 8.5, Composer, Laravel 13 tests, egress to Packagist and GitHub). VPS Docker runner implements the same contract later. |
| D-02 | 5 Nov 2026 | All Vercel work uses `VERCEL_TOKEN_NEW_ACCOUNT` via REST or CLI. The Vercel MCP connector in sessions points at the older account (`muhammad-ahmad-khans-projects`) and must not be used for Stepclimb. Project `stepclimb` created in team `ahmad-code` (`prj_EhsJQAA5N2Mnbc5LNyLVJEfjMFsN`). | Owner rule: new account only. |
| D-03 | 5 Nov 2026 | GitHub sign in is the only auth at MVP (plus optional TOTP). Magic link stays in the kit but is off. | Brief: GitHub OAuth, account age gating for the free tier; users map to installations. |
| D-04 | 5 Nov 2026 | Installation tokens never enter the sandbox: Vercel network policy `injectionRules` add the git auth header for `github.com`. Orchestrator functions (not the VM) create PRs, checks and comments. | Smaller blast radius than the brief's own model if a customer test suite is hostile. |
| D-05 | 5 Nov 2026 | GitHub App credentials are stored encrypted in Mongo by the manifest callback, not pasted into env. | Zero manual copy, one click for the owner. |
| D-06 | 5 Nov 2026 | Job queue and schedulers: Mongo leased `jobs` plus a Cloudflare Worker cron every minute; Vercel Cron as a daily backstop. | Hobby cron limits, Pro optional, VPS later. |
| D-07 | 5 Nov 2026 | Sub processor honesty: first release lists Vercel, MongoDB Atlas, Cloudflare, Stripe and the email provider. The brief's "payment processor only" line returns with the VPS phase. Agencies see the real egress allow list controls; first release is "beta for agencies". | Brief's own model needs always on servers; we do not overclaim. |
| D-08 | 5 Nov 2026 | Design overrides recorded in `docs/DESIGN.md` section 12: three font families, night shift dark palette, solid hero heading, Phosphor icons, snapped type scale. | Playbook allows written ICP overrides. |
| D-09 | 5 Nov 2026 | Mongo free M0 has no backups, so a nightly export to R2 plus restore drill is part of P0-1. Upgrade the cluster tier when paying customers arrive. | Data safety. |
| D-10 | 5 Nov 2026 | GBP and CAD estimates use the ECB reference rate fetched server side with its date shown; billing stays USD. | Brief asks for estimates only and gives no rates. |
| D-11 | 5 Nov 2026 | Refund policy placeholder `{{refund_policy}}` until the owner sets terms; default proposal: full refund of a one time run within 7 days if the PR is not Verified and the repo has tests. | Brief mentions a refund policy without terms. |

# ROADMAP: Stepclimb by BufferSol (full workbook MVP)

P0 numbers refer to `docs/brief.md` MVP scope and `docs/ARCHITECTURE.md` section 6. Each milestone ends with: lint, typecheck, tests, build green; deployed; Playwright screenshots (375/1440, light/dark) in `docs/qa/`; `docs/PROGRESS.md` updated; PR merged to main; one line to the orchestrator.

| Milestone | Scope | P0s | Exit gate |
|---|---|---|---|
| **Phase 0** (done when PR merges) | Research, DESIGN, SECTION_PLAN, ARCHITECTURE, ROADMAP, MANUAL_STEPS, mock, Sandbox spike | none | orchestrator approves design |
| **M1** Foundation and storefront | Copy kit-v1, apply tokens, landing (SECTION_PLAN), pricing rate card, compare and `/laravel-12-to-13` guide, security and legal pages, branded 404, GitHub sign in, accounts and teams, Stripe products and checkout (test), webhook, entitlements, plan limits, invoices PDF skeleton, Atlas db and user, Vercel project, CF cron worker, health, deploy | P0-1 (Vercel form), P0-2, P0-10 (core) | free visitor → sign in → pick plan → Stripe test checkout → plan active, deployed, Lighthouse 90+ on landing |
| **M2** Detect and inspect, runner spike | GitHub App (manifest flow), webhooks, installations and repos sync, `detectApp`, fleet Hangar board, free scan and Inspection report, release watcher and EOL calendar; **runner snapshot spike** (PHP 8.2 to 8.5, Composer, Node, Rector) and `RunnerBackend` + run agent no op PR | P0-3, P0-4, start of P0-5 | 50 fixture detection test green, scan p95 under 20 s, no op work order opens a PR on a test repo |
| **M3** Runs, recipes, verification | Sandboxed runs end to end, recipes 12 to 13 and 11 to 12, then 10 to 11 and Fixer, composer and build and tests verification, skeleton 3 way diff, squawks and agent prompts, Work Order PR body, check run, repair pass (first 30 rules), watchdog and limits, run UI with LogPanel | P0-5, P0-6, P0-7, P0-8 | private Laravel 12 repo → scan → pay $9.99 → verified PR; fixture pass rate reported; egress audit clean |
| **M4** Autopilot, mail, abuse, admin | Weekly deps PR, credits and one time packs, email templates and suppression and unsubscribe, free tier gating, rate limits, ALTCHA, CSP, denylist CI, admin console (run inspector, rule pinning, refund tool), backups and restore drill, alerts | P0-9, P0-11, P0-12, rest of P0-1 and P0-10 | all P0 acceptance tests green; 10 chain catch up from Laravel 10 works as three PRs |
| **M5** QA and launch | Full Playwright set, Lighthouse 90+, design scorecard 40/50 or more, a11y (axe), regression on 50 fixture apps, 60 repair rules, credits page, launch checklist, docs and guides content, beta onboarding page | all | scorecard and checklist committed in `docs/qa/` and `docs/LAUNCH.md` |

Order inside M3 follows the brief's build order: runner no op PR → 12 to 13 and 11 to 12 recipes → 10 to 11 and Fixer → verification and check → squawks and prompts → repair pass.

## Later (not built now, kept behind interfaces)
v1: GitLab, abandoned package flags, advisories, private Composer and npm secrets, `/stepclimb rerun`, Laravel 8 and 9, Slimmer, Tailwind 3 to 4, Livewire 2 to 3, Pest converter, PHP 8.1 to 8.4, monthly conventions PR, client report PDF, live progress and Slack hooks, REST API and webhooks, MCP server, Firecracker runner on the VPS, GitHub Marketplace free listing. v2: Laravel 5 to 7, Lumen, smoke test generator, self hosted runner, Bitbucket. Never: AI features, auto merge.

## Standing rules
Memory in this repo. Decisions logged in `docs/DECISIONS.md`. Manual steps only in `docs/MANUAL_STEPS.md`. Keep 3 Vercel deployments (`scripts/vercel-keep-latest-3.sh stepclimb`).

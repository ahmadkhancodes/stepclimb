# Design scorecard, M5 (DESIGN_PLAYBOOK section 9)

Date: 7 Nov 2026. Build on `main` plus the M5 review fixes. Screenshots: `docs/qa/2026-11-07-m5/` (`/`, `/pricing`, `/security`, `/compare/laravelshift`, `/guides`, `/laravel-12-to-13`, `/sign-in`, 404; 375 and 1440; light and dark), made with `npx tsx scripts/screenshots.ts`. Previous card: `docs/design-qa.md` (M1, 43/50).
Accessibility is now measured, not eyeballed: `tests/e2e/a11y.spec.ts` (axe-core WCAG 2.1 A and AA on 7 pages in both themes, 44 px targets at 375, skip link and visible focus) passes.

| # | Category | Score | Worst problem now |
|---|---|---|---|
| 1 | Message clarity | 5 | None: H1 names Laravel upgrade PRs, one primary CTA "Inspect a repo free". |
| 2 | ICP fit | 4 | Palette and the work order sheet stand apart from laravelshift.com and Renovate; no customer logos yet (none invented). |
| 3 | Hero and product proof | 5 | Sample sheet labelled fictional; support dates under the CTA. |
| 4 | Structure and rhythm | 4 | `InspectionReport` still appears twice on the home page. |
| 5 | Typography | 4 | Hero H1 wraps to four lines at 1440. |
| 6 | Spacing and radius | 4 | Pricing intro link "See the price by price comparison" sits loose under the lede. |
| 7 | Color and contrast | 5 | axe contrast passes on the real tokens in light and dark (was "checked by eye"). |
| 8 | Motion and states | 4 | Reduced motion respected (axe run uses it); signed in error and loading states are not in the screenshot set. |
| 9 | Content honesty | 5 | Claims that the code did not back were fixed (test counts, token life, what the inspection reads, an unsourced competitor citation); see `docs/REVIEW.md` P1-3. |
| 10 | Responsive and ship | 4 | 44 px targets fixed (breadcrumbs, small buttons, table actions); Lighthouse not run here (no network). |

**Total: 44/50.** No category below 4. Hard fails: none. Gate (40/50) met.

## Fixed in M5
- Brand links in header and footer: the `aria-label` hid the visible lockup text (axe `label-content-name-mismatch`); the name now comes from the lockup plus a screen reader " home".
- Sample Hangar table scrolls sideways: now a focusable labelled region.
- Breadcrumb links and every `min-h-8` control (32 px) raised to 44 px.

## Residual
- Lighthouse 90+ on the landing page (run on the deployed URL; LAUNCH.md).
- Signed in screenshots of the Hangar, work order, repo settings and admin (need a seeded session; the e2e specs cover their behaviour).

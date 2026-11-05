# Design QA scorecard (DESIGN_PLAYBOOK section 9)

Date: 5 Nov 2026. Build: `npm run build && npm start`. Screenshots: `docs/qa/<page>-<375|1440>-<light|dark>.png` for `home`, `pricing`, `security`, `compare-laravelshift`, `guides`, `laravel-12-to-13`, `sign-in`, `app`.
Note: `/app` redirects to `/sign-in?next=/app` without a session, so the `app-*` screenshots show the sign-in page. The signed in Hangar needs a live session and is checked in M2.
Self graded by the build session against `docs/design/mock-*.png`; the orchestrator should spot check.

| # | Category | Score | Worst problem |
|---|---|---|---|
| 1 | Message clarity | 5 | None: H1 names Laravel upgrade PRs, one primary CTA "Inspect a repo free". |
| 2 | ICP fit | 4 | Palette (teal, paper, mono) and the work order sheet differ from laravelshift.com and Renovate; no real photography by choice. |
| 3 | Hero and product proof | 5 | Sheet is labelled "Sample, fictional repo"; dated support facts sit under the CTA. |
| 4 | Structure and rhythm | 4 | Bento and sections vary; `InspectionReport` appears twice (tile 3 and step 1). |
| 5 | Typography | 4 | Hero H1 wraps to four lines at 1440; named styles only. |
| 6 | Spacing and radius | 4 | Spacing scale had no 32 or 40 steps, so hero top padding and table min widths silently did nothing. Added tokens. |
| 7 | Color and contrast | 4 | One accent, flat surfaces, no gradients. Contrast checked by eye, not by tool. |
| 8 | Motion and states | 4 | Easing token and reduced motion in place; error and loading states for app pages only partly screenshotted. |
| 9 | Content honesty | 4 | No invented stats, logos or testimonials; sample data labelled. The AI agent column of the compare table is our paraphrase of the brief. |
| 10 | Responsive and ship | 4 | Fixed 375 overflow (header CTA, compare table). No horizontal scroll on any captured page. OG, sitemap, FAQ schema in place; Lighthouse not run. |

Total: 43/50. No category below 3. Hard fails: none.

## Greps (all clean after fixes)
- `text-[`, `p-[`, `m-[`, `gap-[`, `rounded-[`, arbitrary px or rem values: one hit (stamp, fixed with a `stamp-rule` utility).
- Banned fonts: none. `bg-gradient` and `linear-gradient`: none (unused hero gradient utility removed).
- `ease-in-out`, `ease-linear`, `transition-all`: none.
- Banned words: one hit ("unlocks" in a code comment), reworded.
- `href="#"`: none.

## Fixed in this pass
- Header CTA stayed visible at 375 (`hidden` lost to `inline-flex`, no class merger): now `max-sm:hidden`.
- Compare table caption escaped its scroll container and widened the page: region is now `relative`.
- Added spacing tokens 32, 40, 96, 120, 144, 160, 176.

## Residual
- Lighthouse and keyboard pass not run.
- Signed in app screenshots (M2).

# DESIGN: Stepclimb by BufferSol

Status: Phase 0 proposal, awaiting orchestrator approval. Proof: `docs/design/mock.html` (+ `mock-1440.png`, `mock-375.png`). Competitor captures: `docs/design/refs/`.

## 1. ICP card
Tech lead or owner at a 5 to 75 person Laravel agency (or senior dev on a 3 to 15 dev SaaS team). Buys self serve on a company card under about $1,200 a year, after a free scan. Fears: a bot PR that breaks a client app, code leaving their control, a surprise bill. Already loves: GitHub PR UI, Pest output, Pint, Laravel docs, Tailwind. Reads in an editor and a browser side by side, scans tables, distrusts marketing gloss. A second reader, the account manager, must be able to show a page to a client.

## 2. Positioning line
For Laravel agencies and product teams who keep apps on unsupported versions, Stepclimb by BufferSol is the upgrade service that opens a pull request already proven by composer install, a build and your own tests, unlike laravelshift.com, whose PR is not verified, or an AI agent, which is different every run.

## 3. What the category looks like (research, 5 Nov 2026)
Captured at 1440 and 375, `docs/design/refs/`.

| Site | Hero | Palette | Type | Proof | Tone |
|---|---|---|---|---|---|
| laravelshift.com | Giant 4 line headline in black, coral and teal, over a real merged PR screenshot with an "AI prompt" callout | Light grey `#F5F5F5` paper, coral to red CTA gradient, teal accent, rainbow progress bar on top | Heavy geometric sans (sofia pro style), Inter body | Named testimonials with photos, counters, ticker | Friendly, casual, numbered sections |
| getrector.com | Serif headline with one blue italic phrase, dark code window with before and after | Warm off white `#FAFAF7`, blue CTA, near black code panel | Newsreader serif + Hanken Grotesk | Logo wall, executive quotes | Consultative, "hire a team" |
| mend.io Renovate | Product family hero, comparison table | White, corporate blue, Poppins | Poppins | Enterprise logo strip, awards | Enterprise marketing |
| Laravel Boost / docs | Documentation pages | Laravel red on white | System | none | "do it yourself" |

Shared category defaults: a big friendly headline, one saturated accent (red or blue) on the CTA, a product artifact in the hero (PR or code), a logo wall or photo testimonials, light playful copy. Nobody frames the work as a controlled record, and nobody shows verification as the headline object.

**The gap we own:** the upgrade as a signed off maintenance record. Cool paper, document sheets, ruled tables, one restrained teal, rubber stamps for verification. It differs from the closest three on palette (teal on cool grey paper vs coral, blue, red), type (semi condensed grotesk + mono vs geometric display or serif), layout (documents and ruled tables vs hero screenshots and photo cards), imagery (technical manual plates vs photos and logo walls) and tone (exacting vs friendly).

## 4. Concept
"The maintenance hangar logbook." Repos are airframes in a hangar. An upgrade is a work order of numbered tasks. A recipe is a logbook entry. An open issue is a squawk. A green Verified check is a Return to Service stamp. A new Laravel release is a service bulletin. Each term is explained once, in plain words, where it first appears.

Mood: exacting, calm, legible, mechanical, signed off. Never playful, magical or "supercharged".

## 5. Color (role tokens, light only)
Two layers: raw ramps are not needed beyond these; components use role tokens only. CSS variables `--sc-*`, mapped into Tailwind v4 `@theme`. Dark under `[data-theme="dark"]` and `prefers-color-scheme: dark`, with a manual toggle.

| Role | Light | Dark "night shift" | Use |
|---|---|---|---|
| `paper` | `#F7F9FA` | `#0F1417` | page background (cool, not cream) |
| `surface` | `#FFFFFF` | `#172026` | sheets, tables, inputs |
| `ink` | `#14191C` | `#E7EDF0` | text |
| `muted` | `#4E5A61` | `#9AA8B0` | secondary text (4.5:1 on paper) |
| `rule` | `#D5DCE0` | `#2A363D` | 1px borders and dividers |
| `primary` | `#0B5D6B` | `#4FB3C3` | actions, links, current nav |
| `primary-hover` | `#084A55` | `#79C7D3` | hover |
| `primary-soft` | `#E6F1F3` | `#14323A` | selected row, current nav bg |
| `on-primary` | `#FFFFFF` | `#0F1417` | text on primary |
| `success` | `#1F7A3E` | `#4CC27A` | Verified only |
| `warn` | `#E8A200` | `#F5B935` | squawks, warnings, bulletin. Ink text on amber fills, never white |
| `error` | `#B42318` | `#F0645A` | Must fix, failed only |
| `info` | `#2F5C8A` | `#7FA8D6` | Review, service bulletins |
| `*-soft` fills | `#E5F2E9` `#FBF0D3` `#FBE7E5` | `#14301F` `#3A2D0C` `#3A1816` | chip backgrounds |

Rules: one accent (teal, about 80% saturation). Amber only for squawks and warnings, green only for verified, red only for must fix. No Laravel red, no Laravel logomark. Surfaces are flat, no background gradients. The torque tick divider is drawn as SVG strokes, not a gradient.

## 6. Type
Override of the skill's one font rule, written down as the playbook allows (Section 3 override): the work order document and stamps need a semi condensed grotesk, and diffs, versions and SHAs need a real monospace. Three families, each with a job, all self hosted through `next/font/google`:

- **Archivo** (variable, `wdth` axis, `font-stretch` 87.5 to 100) for headings, the lockup, stamps and buttons' numerals. Weights 600 and 700 only. Stamps uppercase, +4% tracking.
- **Public Sans** (variable) for body and UI text.
- **IBM Plex Mono** 400, 500, 600 for diffs, versions, SHAs, test counts and table figures, always `tabular-nums`.

None are on the skill's ban list (Inter, Roboto, Arial, Open Sans, Helvetica). No italics, no 900. `text-wrap: balance` on headings, `pretty` on body.

Scale snapped to Tailwind steps (the brief's off scale values snapped to the step below):

| Style | Step | Size / line | Weight |
|---|---|---|---|
| Heading 1 (hero) | `text-5xl` desktop, `text-4xl` mobile | 48/48, 36/40 | 700 |
| Heading 3 / 4 | `text-4xl`, `text-3xl` | 36/40, 30/36 | 700 |
| Heading 5 / 6 | `text-2xl`, `text-xl` | 24/32, 20/28 | 700 |
| Title 3 / 4 | `text-base`, `text-sm` | 16/24, 14/20 | 500 |
| Body 3 / 6 | `text-base`, `text-sm` | 16/24, 14/20 | 400 |
| Button md / sm | `text-base`, `text-sm` | 16/24, 14/20 | 600 |
| Caption 4 | `text-xs` | 12/16 | 500 |
| Stamp | `text-xs` | 12/16 | 700 uppercase |
| Mono data | `text-sm` or `text-xs` | 14/20, 12/16 | 400 to 600 |

Named classes (`heading-1`, `title-3`, `body-6`, `button-md`, `caption-4`, `stamp`, `mono-data`) defined once, never loose size plus weight utilities.

## 7. Spacing, radius, layout
- Spacing tokens only: 0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96. Table rows 32px dense, 40px comfortable. Main buttons 8px/12px padding, 44px minimum height on touch.
- Radius personality: sharp. Sheets and tables 0, inputs and buttons 4px (`rounded`), popovers 6px (`rounded-md`), stamps 2px (`rounded-sm`) with a double 1.5px border. Nested radius formula applies only where something sits inside a rounded shape with a gap under 32px.
- Container 1280, hero text 680 max. Section padding 80 to 96 desktop, 48 to 64 mobile. Breakpoints 480/768/1024/1280. App rail collapses below 1024.
- Shadows: sheet `0 1px 0 rgba(20,25,28,.06), 0 8px 24px -12px rgba(20,25,28,.18)`, popover `0 12px 32px -8px rgba(20,25,28,.28)`. Dark mode uses a 1px rule border instead of shadows.

## 8. Density, imagery, iconography
- **Density:** marketing medium (document sheets, ruled tables, one idea per band). App high: dense hangar board, tabular figures, sticky headers, keyboard shortcuts visible (`Cmd/Ctrl+K` palette).
- **Imagery:** real product UI built as React components with believable data (a work order sheet, the hangar board, a PR body). Technical manual line drawings in single teal on paper: an exploded app as layered plates, the run pipeline as a cut away. No stock photos, no logo wall, no abstract blobs. Sample content is labelled "Sample, fictional repo".
- **Icons:** Phosphor Regular (allowed set; one stroke weight), plus custom marks: torque stripe, stamp, tag, airframe. Override note: the brief suggested Lucide, the design skill allows only Phosphor, Solar or Iconamoon, so Phosphor wins. No emoji, no icon in a circle on every card.
- **Data viz:** version distance "runway" bars (four steps, amber for the steps you are behind), EOL countdown chips in days, run timelines as Gantt strips (clone, recipes, composer, build, tests, repair, verify). Flat fills, 1px gridlines. Effort band S/M/L/XL as a torque gauge.
- **Signature move:** the Return to Service stamp. Rectangular rubber stamp, double border, rotated -2 degrees, condensed caps, run id and date, "VERIFIED: 214 tests passed". It appears on the work order, in the PR body (SVG), on the client report and in emails. Amber "UNVERIFIED" when there are no tests. Entrance 160ms with `cubic-bezier(.3,1.4,.6,1)` from scale 1.06.

## 9. Motion
Base curve `cubic-bezier(0.22,1,0.36,1)`, 500ms for position, 300ms for colour and opacity, never under 200ms. Transform and opacity only. Scroll reveals rise 32px and fade over 600 to 800ms, once, via IntersectionObserver. Hover: tint or underline colour. Active: `scale(.98)`. Floating compact nav with translucent surface and blur; the mobile menu is a full height panel with links entering 60ms apart (24px rise, 400ms cap). `prefers-reduced-motion`: opacity only, the stamp appears at rest. One orchestrated entrance (the stamp) and the tagline reveal; nothing else decorative.

Mandatory tagline reveal (skill B11): after the benefits, a large statement of at least two lines whose words go from 30% to full ink one at a time on scroll (IntersectionObserver per word); full colour at once under reduced motion.

## 10. Voice
Senior maintenance engineer: precise, calm, honest, US English, sentence case, no exclamation marks. Plain words first, then the logbook term. Errors say what failed and what to do next. Banned: supercharge, revolutionize, seamless, effortless, unlock, "AI powered", "all in one platform". No hyphens in marketing copy (rewrite the phrase). Facts only from `docs/brief.md` or a linked source; missing facts become visible `{{placeholders}}`.

Terms, each explained once: **work order** (one upgrade run and its PR), **airframe** (a repo), **squawk** (an issue we could not fix, ranked Must fix, Review, Note), **return to service** (the Verified stamp), **recipe** (one named, versioned change), **service bulletin** (a new Laravel release notice).

## 11. Do and don't
Do:
- Lead with the artifact (a work order with test counts), not a screenshot of a blank state.
- Show dated, sourced facts (support end dates) next to the claim they support.
- Use ruled tables for pricing and comparison; state the billing unit next to the price.
- Show amber UNVERIFIED honestly when a repo has no tests.
- Keep contrast at 4.5:1 body and 3:1 UI; focus ring 2px primary with 2px offset; 44px touch targets.

Don't:
- Purple or blue gradients, glassmorphism beyond the nav bar, glow blobs, emoji markers.
- Three identical rounded cards, a centered everything hero, a logo wall above the fold, fake logos or testimonials.
- Inter, Space Grotesk, Poppins, cream plus terracotta, AI sparkle or robot icons.
- Anything from laravelshift.com, the Laravel red or logomark.
- Single sided card borders, background gradients, arbitrary font sizes or spacing.

## 12. Overrides recorded (playbook Section 3)
1. Fonts: Archivo + Public Sans + IBM Plex Mono instead of the single skill font. Reason: stamps, document sheets and diffs. Ban list respected.
2. Dark mode backgrounds: night shift palette (`#0F1417`, `#172026`) instead of the skill's six blacks. Reason: cool teal tinted ink matches the paper light mode. Flat, no gradients.
3. Hero heading is solid ink, not the optional left to right text gradient. Reason: a stamp and ruled sheet language is flat and exacting.
4. Icons: Phosphor, not Lucide.
5. Brief type sizes 34, 28, 22, 18, 15, 13 snapped to the scale steps above.

## 13. Why it fits this ICP better than the competitors
- A tech lead deciding whether to let a bot touch client code trusts evidence, not enthusiasm. The hero object is a document that shows what changed, what was run and what is left, which is exactly what laravelshift.com does not show.
- Agencies must show clients something. A work order sheet and a stamped report are shareable as they are; competitor pages are marketing about the product, not artifacts of the work.
- Security reviewers read ruled tables and plain statements; the page carries a data custody statement with no ornament.
- Differs from the three closest competitors on palette, type, layout, imagery and tone, so a buyer comparing tabs sees a different kind of company.

## 14. Component list (build in M1 to M4)
Stamp, WorkOrderSheet, TaskRow, SquawkBadge, RunwayBar, EolChip, FleetTable, LogPanel (virtualized), RateCard (ruled table), TorqueDivider, BrandLockup, CopyButton, Drawer, ServiceBulletin, TaglineReveal, PlateIllustration. Screens: marketing home, pricing, upgrade path pages (`/laravel-12-to-13`), guides, compare, security; app Hangar, Inspection report, Work order, Squawk drawer, Recipes catalogue, Repo settings, Billing (credits as tear off tickets), Team, Client report builder (v1), internal Ops console; generated PR body; emails.

## 15. QA
Scorecard from DESIGN_PLAYBOOK Section 9 at 375 and 1440, light, results in `docs/design-qa.md`. Hard fail greps from the playbook run in CI.

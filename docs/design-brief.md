# Stepclimb by BufferSol: design brief (redesign, 12 Nov 2026)

This file replaces the M0 direction in `docs/DESIGN.md` sections 5 to 8 (teal `#0B5D6B`, Archivo + Public Sans + IBM Plex Mono, cool grey paper). The founder judged that direction "typical AI UI". This brief is the gate from DESIGN_PLAYBOOK section 1: no UI code was written before it.

## 1. Competitor and taste audit (evidence)

Screenshots taken with Playwright on 12 Nov 2026 at 1440x900 and 375x812 (above the fold): `docs/design/refs/2026-11-12/` (script: `scripts/competitor-shots.mjs`).

| Site | Role | What it does | What we take / avoid |
|---|---|---|---|
| laravelshift.com | Direct competitor (leader) | Coral + teal two tone headline, rounded geometric sans, pill CTA with drop shadow, GitHub PR screenshot with tilted sticker labels, segmented progress bar at the very top | Avoid coral, teal (our old accent was close to their secondary), pills and stickers. Keep: the product (a PR) is the hero image |
| getrector.com | Adjacent (PHP upgrades) | Transitional serif display with a blue italic line, dark code editor with green diff lines, logo strip "Trusted by" | Avoid italics, blue, dark editor chrome with traffic lights. Note: a serif reads "senior, considered" to PHP buyers |
| laravel.com | Ecosystem home | Laravel red, light isometric illustration, faint grid background, logo strip with corner tick marks | Red belongs to Laravel; never use it as our accent. Corner ticks are a nice "drawing" detail; we use rules instead |
| forge.laravel.com | Ecosystem product | Centred hero, "Introducing" pill, mint gradient swooshes, black buttons, real app UI under the fold | This is the exact template the ban list describes. Keep only: real UI with real looking data |
| spatie.be | Agency the ICP admires | Condensed uppercase poster type, dark green gradient, hand made sign | Shows the ICP rewards strong typographic voice. Avoid dark gradients |
| laravel-news.com | What the ICP reads every day | Newspaper masthead, dateline row ("Thursday, November 12, 2026"), double rules, tracked small caps labels in red, three columns with vertical rules, tight headline leading | This is the most recognisable visual language for a Laravel agency lead. We borrow the editorial grammar (dateline, rules, columns), not the look (no red, no masthead centring) |

What they all share: a sans or serif headline left of a product picture, one saturated brand colour, rounded buttons, a logo strip. What none of them do: show **dates**. Yet the whole buying trigger for this ICP is a date (Laravel 12 security support ends 24 Feb 2027; PHP 8.2 ends 31 Dec 2026).

## 2. ICP card

- **Who:** Agency Alex, tech lead or owner at a 10 to 60 person Laravel agency (Austin, Toronto, Manchester) looking after 30 to 150 client apps; Product team Priya, senior dev with 1 to 5 repos.
- **Reads:** Laravel News, Laracasts, r/laravel, PhpStorm all day, GitHub PRs.
- **Values:** proof over promises, dates and version numbers, no AI touching client code, a board they can show a client.
- **Words:** upgrade, breaking change, EOL, PR, composer, CI green, stranded apps.
- **Tone:** a maintenance logbook kept by a careful engineer. Plain, dated, signed off.

## 3. Positioning line

**Laravel upgrade PRs that prove they work, dated and signed off like a maintenance logbook, at about half the price of laravelshift.com.**

## 4. Visual system: "the logbook"

The idea: every page is a page from an engineer's maintenance log. Entries are dated, ruled, numbered and signed off. The signature moment is the **EOL dateline**: a ruled strip under the header that prints real support end dates (from `src/content/dates.ts`), the way a newspaper prints today's date.

### Palette (warm paper and ink, one accent)
Derived from the ICP: logbook paper, carbon ink, and **flight recorder orange** (the colour of the box that proves what happened in a flight, which is what a Verified check does for an upgrade). Not red (Laravel), not coral or teal (laravelshift.com), not blue or indigo (default AI), not green (Rector and our Verified state).

| Role | Value | Notes |
|---|---|---|
| paper (surface) | `#F4F1EA` | warm off white |
| sheet (raised) | `#FFFDF8` | entries, tables, inputs |
| sunken | `#EAE5D9` | table heads, wells |
| ink (text) | `#1C1A16` | 15.4:1 on paper |
| ink subtle | `#4F4A40` | 7.8:1 on paper |
| ink muted | `#6B6458` | 5.2:1 on paper (4.7:1 on sunken) |
| rule | `#D6CFBF` | hairlines |
| rule strong | `#8F8572` | input borders, 3.6:1 on sheet |
| accent (action) | `#B23C0E` | recorder orange, 5.9:1 with white, 5.3:1 on paper |
| accent hover | `#8E2F0A` | |
| accent soft | `#F7E3D6` | selected rows, current nav |
| verified (success) | `#2F6B3A` | state only |
| amber (squawk) | `#D99A1E` | fills only, ink text on top |
| danger | `#A12A1F` | state only |

### Type pairing (next/font)
- **Display: Newsreader** (serif with optical sizes, weight 500 only, never italic). Gives the editorial, signed off voice; nobody in the audit pairs a serif with dates and tables.
- **Text: Schibsted Grotesk** (a grotesk drawn for a newspaper group; legible at 14px in dense tables).
- **Figures: JetBrains Mono** (the font this ICP stares at in PhpStorm all day) for versions, dates, money, repo names.
- Mono is not preloaded (it only sets figures), which keeps the display face first in line for the hero paint.
- Labels: Schibsted Grotesk 12px, semibold, uppercase, tracked 0.08em ("logbook labels"), as in a printed form.

### Grid, rules and radius
- 12 column grid, `max-w-7xl`. Sections break the grid on purpose: the hero is 5 + 7 columns, the problem is a full width ruled ledger, features are a two column ledger with a numbered left margin, not cards.
- **Rules instead of cards.** Sections open with a double rule (`3px double ink`). Entries are separated by 1px hairlines. Vertical column rules on the ledger sections.
- Radius: **0 on all surfaces**, **2px on buttons and inputs** only. No shadows except one on dialogs and the floating header.
- Rhythm varies: dense ledger sections (64px), open statement sections (128px), the dateline strip (12px).

### Imagery
Only real product UI rendered from real components with realistic, fictional, labelled data (`src/components/marketing/demo/*`): Work Order, Hangar board, Inspection report, squawk comments. No illustrations, no emoji, no logo strip (we have no customers to name yet).

### Motion
One stamp press on the Verified stamp (160 ms), reveal fades on scroll, and nothing else. All disabled by `prefers-reduced-motion`.

## 5. Banned on this product (checked per page)
Centred hero over a glow; purple, indigo or default blue accent; one sans everywhere; three identical icon cards; "everything you need" grids; emoji or stock art; glassmorphism; one radius on everything; "New" pills; identical section padding; invented numbers; "streamline", "seamless", "supercharge".

## 6. App direction
The app is the logbook itself: a left rail with the org and five sections (Hangar, Work orders, Billing, Settings), a dateline across the top of the content showing the next EOL date that affects the fleet, ledger tables (40px rows, mono figures, hairline dividers, sticky sunken head), one orange primary action per screen, empty states that show a fictional example row and the one next step.

## 7. Self-critique log (DESIGN_PLAYBOOK section 9, light only)

Screenshots: `docs/qa/design/` (1440 and 375, full page and fold, marketing and signed-in app). Iteration captures were taken with `scripts/app-screenshots.mjs` and a fold/full script at each round.

| Screen | Round 1 (worst problem) | Round 2 | Round 3 (final) |
|---|---|---|---|
| Hero `/` | Leftover 160px top padding from the floating header, H1 broke into 4 lines, EOL note duplicated the dateline | Work order header cells wrapped at 6 columns | 5/7 split, H1 at heading-1, one primary action, dateline as signature; passes 5 second test |
| Hangar `/app` | Content capped at `max-w-5xl` so "Open inspection" clipped; rows doubled by stacked actions; empty state's primary was "Read docs" | Repo names wrapped at hyphens (`text-wrap: pretty` beat `nowrap`) | Mono repo names, repo name links to autopilot, one action per row, example row in empty state, no overflow at 375 |
| Pricing `/pricing` | Loose head with a floating unstyled link, lone interval toggle, two orange primaries | Bare "Pricing" H1 wasted the largest type | Specific H1 ("a free inspection, then upgrades from $9.99"), ruled head, inline toggle, single primary (free inspection) |

Final scores (0 to 5): message clarity 5, ICP fit 5, hero and product proof 5, structure and rhythm 4 (the "how it works" fragments are small at 1440), typography 5, spacing and radius 4, colour and contrast 5, motion and states 4, content honesty 5, responsive and ship 5. Total 47/50, no hard fails.

Lighthouse (mobile, simulated throttling, local `next start`, three runs): `/` performance 95 to 96, `/pricing` 94 to 98, accessibility 100 on both, CLS at most 0.002. Run to run variance is a point or two around 95 on `/` and `/pricing`.

Residual: emails (`src/lib/mail/*`) keep their neutral template; old M1 screenshots in `docs/qa/*.png` show the previous design.

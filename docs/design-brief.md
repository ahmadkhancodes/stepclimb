# Stepclimb by BufferSol: design brief (identity "the work order", 12 Nov 2026)

Second revision the same day. The "logbook" look (warm paper, rust orange, Newsreader serif) matched six sibling BufferSol products by accident. Stepclimb now has its own identity: **cool technical drawing paper, deep navy ink, safety orange used sparingly, a condensed grotesk plus mono, hangar work order and checklist motifs.** Sections 1 to 3 (audit, ICP, positioning) still hold.

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
- **Tone:** a hangar work order filled in by a careful engineer. Plain, dated, checked off, signed.

## 3. Positioning line

**Laravel upgrade PRs that prove they work, dated, checked and signed off like a hangar work order, at about half the price of laravelshift.com.**

## 4. Visual system: "the work order"

The idea: every page is a sheet from a hangar work order pinned to a drafting board. Boxes have printed field labels, procedures are checklists, and a job only returns to service when the boxes are ticked and the tag is signed. The signature moments: the **EOL title block** under the header (boxed cells with real support end dates from `src/content/dates.ts`) and the **hero drawing frame** (a 2px navy frame with a header strip, a checklist on the left, the work order on drafting film on the right and a title block row along the bottom).

### Palette (drafting film and navy ink, one sparing safety orange)
Not red (Laravel), coral or teal (laravelshift.com), indigo or purple (default AI), rust on cream (Postslot), lime on black (Inboxwire), mint and forest (Wirebook), concrete and teal (DockCrate), cobalt on white (Hotrail).

| Role | Token | Value | Contrast pair |
|---|---|---|---|
| paper (surface) | `--surface` | `#E8EEF3` | ink 13.8:1 |
| sheet (raised) | `--surface-raised` | `#F7F9FB` | ink 15.3:1 |
| sunken (table bands) | `--surface-sunken` | `#D9E2EA` | ink 12.3:1, muted 4.9:1 |
| navy ink (text, frames, tabs) | `--text` / `--surface-inverse` | `#0D2236` | paper on ink 13.8:1 |
| ink subtle | `--text-subtle` | `#2C4660` | 8.3:1 on paper |
| ink muted | `--text-muted` | `#4A6178` | 5.5:1 on paper, 4.9:1 on sunken |
| rule | `--border` | `#BCCAD6` | hairlines (decorative) |
| rule strong | `--border-strong` | `#6C8297` | input borders, 3.8:1 on sheet |
| drafting grid | `--grid-line` | `#D0DBE4` | decorative only |
| safety orange (primary fill) | `--action` | `#F26A1B` | **navy text on it, 5.3:1**; never used as text (2.6:1 on paper) |
| safety orange hover | `--action-hover` | `#FF8A4C` | navy text 6.9:1 |
| link and text actions | `--link` | `#174A7C` | 7.8:1 on paper, 6.9:1 on the selected tint |
| selected tint | `--action-soft` | `#D6E2EE` | ink 12.3:1 |
| verified | `--success` | `#1D6A43` | 5.3:1 on its surface `#D9EBE0` |
| warning text | `--warning` | `#7A4800` | 6.2:1 on `#F8E6C4` |
| amber fill (unverified tag, squawks) | `--amber` | `#F0B43C` | ink on it 8.7:1 |
| danger | `--danger` | `#B0261B` | 5.2:1 on `#F8DEDB` |

Orange budget: one primary action per screen, the top step of the logo mark and the active nav underline. Everything else is navy.

### Type pairing (next/font)
- **Display: Barlow Condensed 600** (hangar signage). Hero and page H1s set in caps; section headings in sentence case. Field labels (`label-log`) are Barlow Condensed caps, tracked 0.06em, like the printed captions on a form.
- **Text: IBM Plex Sans** 400/500/600 (engineering grotesk, legible in dense 14px tables).
- **Figures: IBM Plex Mono** 400/600 for versions, dates, money, repo names, commit SHAs. Not preloaded.
- Note: the CI headless Chromium rounds glyph advances to whole pixels, so screenshots show small gaps ("Buf ferSol"). Real browsers position subpixel; this is not a font bug.

### Grid, rules and radius
- 12 column grid, `max-w-7xl`. The hero is a framed 6/6 drawing sheet with a 4 cell title block underneath; other sections use 5/7 and 12 column ledgers.
- **Frames and tabs instead of cards.** A section opens with a 2px navy rule and a navy tab hanging from it (`rule-double` + inverse `label-log`). Primary tables, the rate card and Hangar stats sit in 2px navy frames with a navy header row; entries are separated by 1px hairlines.
- **Checklist boxes** (`src/components/ui/check-box.tsx`) replace bullet ticks: hero claims, plan includes, verification steps, the sign-in "what happens next" list (open boxes).
- **Return to service tag** replaces the rotated rubber stamp (that is Postslot's motif): an upright tag with an eyelet, a ticked box and the run and date.
- **Drafting film** (`bg-drafting`): a 24px minor and 120px major grid drawn as SVG lines (no gradients), only behind the hero work order and the sign-in aside.
- Radius: 0 on sheets, frames and tables; 2px on inputs and small tags; 4px on buttons and the tag. No shadows.
- Rhythm: tight 64, base 96, open 128 on desktop; title block strip 8.

### Imagery
Only real product UI from real components with labelled, fictional data (`src/components/marketing/demo/*`). No illustrations, no emoji, no logo strip.

### Motion
The return to service tag ticks its box once (160 ms stroke draw), reveal fades on scroll, nothing else. Off under `prefers-reduced-motion`.

### What changed, what stayed
- Changed: palette, all three fonts, section heads (double rule became navy rule plus tab), dateline (became a boxed title block), hero (became a framed drawing sheet with checklist and title block), rate card (navy frame and header row, checklist includes, featured plan as a navy banded row), Hangar (navy framed stats and table), auth aside (drafting film, checklist), 404, OG image, favicon and apple icon, email template colours, theme-color.
- Stayed: copy and claims, information architecture, routes, real product UI in the hero, EOL dates as the signature, light only, the component APIs.

## 5. Banned on this product (checked per page)
Centred hero over a glow; purple, indigo or default blue accent; orange text; one sans everywhere; three identical icon cards; "everything you need" grids; emoji or stock art; glassmorphism; one radius on everything; "New" pills; identical section padding; invented numbers; rubber stamps, cream paper or serif display (sibling looks); "streamline", "seamless", "supercharge".

## 6. App direction
The app is the hangar office: a left rail with the org and sections, the EOL title block across the top, page heads in condensed caps over a 2px navy rule, navy framed tables with a navy header row (40 to 48px rows, mono figures, hairline dividers), one orange primary action per screen, empty states that show a fictional example row and the one next step.

## 7. Self-critique log (DESIGN_PLAYBOOK sections 8 and 9, light only)

Screenshots: `docs/qa/design/` (1440 and 375; marketing full page and fold via `scripts/design-shots.mjs`, signed-in app via `scripts/app-screenshots.mjs`).

| Screen | Round 1 (worst problem) | Round 2 | Round 3 (final) |
|---|---|---|---|
| Hero `/` | 6/6 split wrapped the repo name in the work order head; title block strip wrapped to two rows on phones; Barlow body text looked gappy | 5/7 split pushed the H1 to 4 lines and wrapped the CTA row, title block fell below the fold | 6/6 with the airframe on its own row in the work order head, title block visible at 1440x900, H1 48px on phones, date strip scrolls sideways inside itself, IBM Plex Sans text |
| Pricing `/pricing` | Selected interval and free plan CTA both orange (two oranges); thin grey frame read as generic | Navy framed rate card, navy column head, checklist includes; tall gap above the toggle on phones | Interval toggle navy, one orange primary (free inspection), featured Agency row as a navy banded row with a navy tag, tighter phone spacing |
| Hangar `/app` | Recoloured only: grey bordered stats and table, sentence case H1 | Navy framed stats and table with a navy header row, caps H1 over a 2px rule | Checked at 375: cards keep the frame, no overflow |

Playbook section 8 check: no gradient or glow (grid is SVG lines), no purple or indigo, no centred hero, no three identical cards, no stock art or emoji, no invented stats (title block cells restate existing claims: from $9.99, free inspection, no AI on code, never auto merge), radius varies by role.

Final scores (0 to 5): message clarity 5, ICP fit 5, hero and product proof 5, structure and rhythm 4, typography 5, spacing and radius 4, colour and contrast 5, motion and states 4, content honesty 5, responsive and ship 5. Total 47/50, no hard fails.

Lighthouse 13.6 (mobile, simulated throttling, local `next start`, two runs each): `/` performance 99 and 100, `/pricing` 100 and 100, accessibility 100 on both, CLS 0.

Residual: older M1 screenshots in `docs/qa/*.png` and `docs/qa/2026-11-07-m5/` show earlier designs; `docs/DESIGN.md` sections 5 to 8 are historical.

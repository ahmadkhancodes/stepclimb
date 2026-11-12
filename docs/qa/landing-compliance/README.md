# Landing compliance, 12 Nov 2026

Before: `before-*` (copied from docs/qa/design, the "work order" redesign). After: `after-*` (local `next start`, 1440 and 375, light), plus `after-menu-390.png`.
Measured with `scripts/qa-landing-measure.mjs` (needs `next start -p 3100`): h1 is 526px wide at 1440 (2 lines) and 322px at 390. Font sizes found: 12, 14, 16, 18, 20, 24, 30, 36, 48, 60. Weights are 400 to 600, with no italics and no horizontal overflow. The nav sits 12px from the top with a blur of 12px. Tagline words go from 0.3 to 1 one by one, and are all 1 under reduced motion. Menu delays are 0 to 360ms.
Lighthouse 12 mobile (local): `/` perf 97 to 99 and a11y 96 (the only finding is contrast on unlit tagline words). `/pricing` perf 95 and a11y 100.

## Uniqueness proof

| | Stepclimb |
|---|---|
| Palette | drafting paper `#E8EEF3`, sheet `#F7F9FB`, navy ink `#0D2236`, link navy `#174A7C`, safety orange `#F26A1B` (fill only), amber `#F0B43C` |
| Fonts | Barlow Condensed 600 (display), IBM Plex Sans (body), IBM Plex Mono (figures) |
| Radius feel | square sheets and tables (`rounded-none`), 4px buttons and tags, 2px inputs |
| Layout type | the "work order" layout: a framed drawing sheet hero, then ledgers with no cards. It suits teams who audit before they merge |
| Hero composition | 2px navy frame: condensed caps headline with a checklist on the left, a work order on a drafting grid on the right, and a title block row of facts below |
| Signature element | EOL title block strip under the nav, plus the Return to Service tag |

How it differs from the other six: Stepclimb is the only blueprint (drafting grid, navy frames, condensed caps). It is not Postslot's warm paper and stamp, Wirebook's green ledger, DockCrate's steel stencil, Hotrail's navy rail, Inboxwire's white API docs or Straightpin's newsprint.

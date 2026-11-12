# QA report: battle test as the ICP (12 Nov 2026)

Run against the production build (`next start`, memory DB, outbox mail, fixture GitHub). Specs in `tests/e2e/qa/` (`crawl`, `journeys`, `states`, shared `helpers`). Whole suite: 54 Playwright tests, lint (0 errors), typecheck, unit tests and build green. Not deployed.

## Journeys covered
- Visitor to Hangar through the real UI: landing CTA, sign-in form (empty and invalid email stay put with a message), magic link sent, link from the outbox, onboarding, Hangar.
- Reused magic link in a second browser: no session, no 500.
- Onboarding with blank, HTML, unicode and 300 character names: visible error or escaped result.
- Free user: empty Hangar (has a next step), seeded fleet, rescan, inspection report, refresh, back and forward, Start work order (double click makes one run), run view, work-orders list.
- No credit: Start shows the one-off price instead of silence; `/api/runs` refuses.
- Other organisation cannot open my inspection, run or cancel it; sees none of my rows.
- Settings: profile save and reload with hostile name, API key create (short and 500 character names), member invite (invalid, valid, duplicate).
- Billing page upgrade button in stub mode gives a notice, not silence.
- Pricing page prices equal `src/config/product.ts` (plans and one-offs).
- Sign-in `next` and onboarding `next` cannot redirect off site.
- Delete-account dialog: confirm disabled until typed, Escape closes, nothing deleted.
- Hostile JSON (empty, 20k chars, script tags, bad enums, malformed JSON) to 7 endpoints: never 500.
- 404s for unknown repo, run, inspection; admin and founder pages closed to normal users; signed-out `/app*` redirect to sign-in; sign-out ends the session.
- All 13 public pages at 375 and 1440, light: 200, no console errors or hydration warnings, no failed requests, no horizontal scroll, no unnamed controls, no dead internal links.
- All 9 signed-in app pages at 375 and 1440: same checks.
- Keyboard: first Tab lands on a control with a visible focus ring; every enabled button and link shows the pointer cursor.

## Defects found and fixed
1. Mobile tap target: the "Stepclimb" logo link in the app header and the auth layout header (sign-in, onboarding) was 28px tall. Now `min-h-11`. Regression: `journeys.spec.ts` tap target tests (app shell and sign-in).

The CSP and form-action class of bug is already covered by `tests/unit/csp-form-action.test.ts`; the new specs drive every form through a real browser and found nothing else silent.

## Open
- **Low, not reproduced in dev:** in the production build, a React hydration error (#418) fires on `/onboarding` when it is reached through the magic link redirect from a browser that previously loaded `/` or a 404 page (not after `/pricing` or `/sign-in`). Nothing visible breaks. Dev mode shows no mismatch, so the element is unidentified. Needs a non-minified production build (`next build --debug`) to locate. `states.spec.ts` clears cookies and attaches the console watcher after sign-in to avoid this order, so it is not hidden elsewhere: the crawl specs still assert zero page errors.
- **Low:** dev-only font preload warnings ("preloaded but not used") on the 404 and sign-in pages; wasteful preloads of fonts those pages do not use.
- **Low:** passkey button with no passkey shows "Auth cancelled", which reads as an error; copy could say no passkey was found.
- Not testable here: real Stripe checkout and portal, real GitHub App install, real sandbox runs (MANUAL_STEPS 5, 6).

## Battle hardening round (12 Nov 2026, second pass)
Added `tests/e2e/qa/battle.spec.ts` (6 tests; whole suite 51 Playwright tests) and `tests/unit/battle.test.ts`; unit 344 tests; lint (only the off-limits `.github/claude/run.mjs` warning), typecheck, build green. Not deployed.
- **CSP in a real browser:** `securitypolicyviolation` is recorded on every public page and every app page; the only report is a refused `eval` probe from a bundled library on `/sign-in`, caught by the library, nothing visible depends on it. Security headers asserted.
- **Tenant isolation:** Hangar CSV for org B is the header only after org A seeded repos; signed out is refused. Earlier specs already cover runs, inspections and cancel across organisations.
- **Resilience:** session cleared mid use gives 401 JSON for APIs and the sign-in page for pages; huge ids, HTML and `../` in run bodies give 4xx JSON, never 500; cross-site POST gives 403; the no-op probe gives 403.
- **Webhooks and abuse:** Stripe bad signature records nothing (duplicates and out-of-order refunds were already in `hardening.test.ts`); webhook flood and invite limits unit tested.
- **Secrets:** `npm run scan:bundle` found nothing in 38 client files, and a unit test proves it detects key shapes and live env values.
- **Not covered here:** database slow or down in the browser (the memory DB cannot be stopped; `/api/health` returns 503 within 2 s by design), real Stripe/Resend timeouts (Resend rejections never throw: `sendMailSafe`), clock skew on magic links (Better Auth owns expiry, 10 minutes; a skewed clock gives the standard "link expired" and the sign-in form is one click away), concurrent edits (credit spend, refund and first-run are claim based and tested; settings are last write wins).

## Post-redesign regression pass (12 Nov 2026)
Specs in `tests/e2e/qa2/` (`brand`, `interactions`, `layout`, `limits`) plus `tests/unit/qa2-regressions.test.ts`. Whole suite: 69 Playwright tests, unit tests, lint (only the off-limits `.github/claude/run.mjs` warning), typecheck, build green. Not deployed.

### Journeys covered
- Every public page (13 plus a 404) in a light and an OS-dark browser: computed fonts only Barlow Condensed, IBM Plex Sans or Mono (or system fallbacks), no pixel of the v1 teal/amber or v2 logbook palette, no `dark` class or theme attribute, background identical under `prefers-color-scheme: dark`, `color-scheme: light`.
- Same brand check on all 9 signed-in pages.
- OG, Twitter image, icons, robots, sitemap, llms files: 200 and the right content type; one `theme-color`; magic-link e-mail has no old colours or fonts.
- Mobile menu: opens, Escape closes it and returns focus to the toggle, each link navigates and closes it. Desktop header and footer links: 200 and an h1. In-page anchors resolve to existing ids on 7 pages. No `href="#"` CTAs.
- Keyboard only on sign-in: every Tab stop shows a focus indicator; Enter submits.
- Signed-in nav at 1440 and 375, sign-out then `/app` returns to sign-in, signed-out `/app/billing` goes to sign-in with `next`, checkout return query strings render.
- Contrast (WCAG AA computed on every text node, flat backgrounds) and clipped text (ellipsis or overflow hidden) on all public and app pages at 375 and 1440: none.
- Copy and numbers: every `$` figure on pricing, landing, compare, guides and legal pages traced to `src/config/product.ts`, the brief, or the dated competitor price list; no testimonials, customer counts or logos exist in the source.
- User at the plan limit: free workspace seat usage and the second-member case (below).

### Defects found and fixed
1. **Seats were advertised but never counted or limited** (Medium). The pricing page, billing page and overview show "N seats" per plan, but the seat meter was a monthly counter nothing ever incremented (always "0 of 1"), and any number of people could join a 1 seat plan. Now: usage shows the live member count (`seatsInUse`, `currentUsage(..., liveSeats)`), a full house is not a warning and only more members than seats is "over", and accepting an invitation past the plan's seats is refused (`membershipLimit` in the organization plugin) with a plain message on the accept page. Regression: `limits.spec.ts`, `qa2-regressions.test.ts`.
2. **Global error page lost the brand fonts** (Low). `global-error.tsx` replaces the root layout but did not attach the font variables, so it rendered in system fonts. Fixed; unit regression.
3. Stale comments naming the old brand ("serif", "teal") in `final-cta.tsx` and `runway-bar.tsx` corrected.

### Open
- **Low:** repo meter still shows "0 of N" for the same reason as defect 1, but a live count would flag every Free user (limit 0) and every Solo user with more synced repos than paid ones as "over limit" before repo enforcement is defined. Needs a product decision on what over-limit repos do (the banner promises read only); not changed.
- **Low:** some class names still carry the retired "logbook" vocabulary (`label-log`, `rule-double`); behaviour and looks are right, rename is cosmetic.
- **Info:** on plain `http://localhost` the production CSP `upgrade-insecure-requests` makes router prefetches after sign-out fail with `ERR_SSL_PROTOCOL_ERROR`; harmless on https (production), filtered in the spec.
- The earlier open items (prod-only hydration #418 on `/onboarding`, passkey "Auth cancelled" copy) were not reproduced or changed here.

## Usefulness pass 2: first ten minutes, working docs, billing path (12 Nov 2026)
Run against the production build (memory DB, outbox mail, fixture GitHub as the stand-in for the GitHub App install, no Stripe key so billing is in stub mode; Stripe itself is covered by a faithful stand-in in unit tests). New specs: `tests/e2e/personas.spec.ts` (5 tests), `tests/unit/usefulness.test.ts` (17 tests). Whole suite: 83 Playwright tests, 379 unit tests, lint (only the off-limits `.github/claude/run.mjs` warning), typecheck, build green. Not deployed.

### Personas (from docs/brief.md)
- **Solo Sam**, indie dev with 2 live Laravel apps, one on 11.x. Wants to know how far behind he is and pay per PR, not per month.
- **Agency Alex**, tech lead at a 25 person agency with 40 client apps. Wants the fleet view, a teammate in the account and a webhook into their own tooling; decides between Studio and Agency.
- **Product-team Priya**, senior dev on a 6 dev SaaS team with 3 repos. Wants an API key for an internal dashboard, reads the docs before anything else, picks a plan from the pricing page.

### Week in the life (walked in Playwright, then turned into specs)
- **Day 1, first value.** Landing "Inspect a repo free" -> email -> magic link -> name the organization -> Hangar -> (GitHub install) -> Open inspection: 6 clicks including the e-mail link and the install, now a budget asserted in `personas.spec.ts`. Friction: the free Hangar showed **"Repos 0 of 0"**, which reads like something is broken.
- **Day 2, second thing.** Sam/Priya create an API key: the key was shown alone, so the first request meant reading the docs and typing the URL. Alex invites a teammate on Free (1 seat): the invitation was sent, then **the teammate's accept was refused**, with nothing on the owner's side saying why (dead end). Alex subscribes a webhook to `member.invited`: **the event was never sent** by the product.
- **Day 7, the limit and the decision to pay.** On Billing the 6 month plans read **"$74 per half"** and **"Billed monthly only."** (both wrong: they bill every 6 months), and arriving from the pricing page with `?plan=legacy_solo` said "billed yearly". Coming back from a canceled Stripe Checkout showed the plain page with no word that nothing was charged.
- **Docs.** Getting started told users to "pick the hop, for example 11 to 13", but a work order moves one major; the API page pointed at "Settings, then Account" (it is Profile); authentication said sign in is GitHub only (the email link is the default); the webhooks page did not list its events or the body envelope.

### Fixed (top five by impact, plus the docs)
1. **6 month pricing copy**: `INTERVAL_COPY` in `src/config/product.ts`; Billing shows "every 6 months", "Billed every 6 months only." and the right preselect sentence.
2. **Meters a plan does not include** read "Not on this plan" instead of "0 of 0" (Hangar, Billing).
3. **Seats**: the Members page warns when members plus pending invitations fill the plan's seats and links to Billing (D-UP2).
4. **API key snippet**: after creating a key, a ready to run `curl .../api/v1/me` with the real origin and key and a Copy command button; the same function (`src/content/docs/snippets.ts`) renders the docs sample.
5. **Webhooks**: `member.invited` is now emitted; every event offered on the settings page is emitted and documented (unit guard).
6. **Billing return**: `?checkout=canceled` shows "Checkout canceled. Nothing was charged"; Checkout and portal return URLs come from one helper (`checkoutReturnUrls`).
7. **Docs** corrected as listed above; the same two mistakes were fixed in the privacy policy ("Settings, then Profile") and on the landing page ("Pick the next hop, for example 11 to 12").

### Docs executed by tests
- The authentication curl (docs page and the API keys page) runs with `curl` against the app and returns the org id; the API error sample equals the real response to a bad key; the `GET /api/v1/me` sample has the real shape; account export returns JSON; the docs page renders the command.
- The Node signature verifier in the webhooks docs is written to a file, imported and checked against our real `signPayload`: accepts, and rejects a changed body, a wrong secret and a replay.
- The rate limit sentence equals `RULES.api`; every "Settings, then X" names a real sidebar page; `docs/STRIPE.md` lookup keys and amounts equal `product.ts`. The only other code blocks in `docs/` are diagrams and a spike log in ARCHITECTURE.md, not runnable steps.

### Billing path (as far as Stripe test mode allows without a card)
For **every** paid plan and interval: Checkout uses the price with the right lookup key, `metadata.app=stepclimb` on the session and subscription, success and cancel URLs on `/app/billing`, adjustable quantity on per repo plans; the `checkout.session.completed` webhook activates that plan with its seat and repo limits (per repo quantity respected). The portal opens for the paying customer and returns to Billing; cancel at period end keeps the plan and flags it; `customer.subscription.deleted` drops to Free limits.

### Left open
- Real Stripe Checkout, portal configuration and webhook endpoint still need the live keys (MANUAL_STEPS).
- No run events (`run.finished`, `pr.opened`) on outbound webhooks yet; they would be the most useful ones for agencies.
- Repo meter enforcement (earlier open item) is unchanged; Free now reads "Not on this plan" rather than a count.
- `emitEvent` tries delivery inline, so a slow customer endpoint can add up to its timeout to the invite request.

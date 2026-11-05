# SECTION PLAN: landing page

Layout type: **A, classic hero plus sections**, with one comparison section borrowed from type D. Reason: the product is understandable from a hero artifact (a work order), and search traffic ("Laravel 12 to 13 upgrade", "laravelshift alternative") lands on dedicated pages (`/laravel-12-to-13`, `/compare/laravelshift`) that use type D.

One offer, one audience, one action: *Laravel agencies and product teams, free inspection of a repo, "Inspect a repo free".*

Intake assumptions (one line each, per skill A1): traffic is search, Laravel News, Reddit and X; visitors know Laravel and probably laravelshift.com; proof assets are limited to dated public facts until real merged PRs exist; mobile is read mostly (tech lead checks on a phone, acts at a desk).

SEO/AEO: index. Title "Stepclimb by BufferSol: verified Laravel upgrade pull requests". Description "Upgrade Laravel as a pull request that ran composer install, your build and your tests before you saw it. Free inspection. From $9.99 per upgrade." FAQ schema on the FAQ. All copy below follows the no hyphens, no banned words rules. `{{...}}` marks facts we do not have yet.

## 1. Nav (floating compact bar)
Lockup, Product, Pricing, Guides, Security, "Inspect a repo free" (primary), theme toggle. Sign in is a text link inside the mobile panel and the footer. Current page indicated.

## 2. Hero
- Headline: "Laravel upgrade PRs / that prove they work"
- Sub: "Stepclimb by BufferSol upgrades your Laravel app as a pull request: one commit per change, composer install and your tests run in our own sandbox, and a repair pass driven by rules for common breakage. Your code never leaves our servers. From $9.99 per upgrade."
- Primary CTA: "Inspect a repo free". Secondary text link: "See a sample work order".
- Risk reversal under the CTA: "The free inspection reads composer.json and composer.lock only. No code is cloned."
- Proof signal: dated support table, "Laravel 11 security fixes ended 12 Mar 2026. Laravel 12 security fixes end 24 Feb 2027. Dates from the Laravel release notes, checked 3 Nov 2026."
- Visual: the Work Order sheet component (as in `mock.html`), labelled "Sample, fictional repo", with the Return to Service stamp. Cropped to header, four tasks and stamp at 375.

## 3. Problem, in their words
Heading: "Every Laravel major ends the clock on the one before it"
Body: "Laravel ships a breaking major each year, around Q1. Each gets 18 months of bug fixes and 2 years of security fixes. So an app left alone for two releases is out of support, and the longer the gap, the bigger the diff. Teams put it off until the client asks about a security questionnaire, a host drops old PHP, or composer audit finds a CVE."
Right column: a "support runway" strip drawn with RunwayBar and EolChip for Laravel 10, 11, 12, 13 using only the dated facts in the brief. `{{laravel_13_security_end}}` and the 10.x row are filled from laravel.com at build time (data/eol.json), not typed by hand.

## 4. Benefits (bento, five tiles, not equal cards)
1. **Verified, not just opened** (large tile, work order fragment): "composer install, npm run build and your tests run in a fresh sandbox before the PR opens. The result is a check on the PR: Verified, with test counts."
2. **One change per commit** (tall tile, commit list fragment): "Each recipe is one atomic commit with a name and a version, so you can review, revert or cherry pick."
3. **Inspect before you pay** (wide tile, inspection report fragment): "A free report from composer.json and composer.lock: versions behind, support end date, recipes that apply, effort band S to XL."
4. **Your code stays on our servers** (tile, data custody lines): "Runs happen in an isolated sandbox that is destroyed after the run. We keep no customer code. Nothing is sent to an AI service."
5. **Stay current weekly** (tile, autopilot PR fragment): "One grouped dependency pull request a week per repo, verified, that refreshes instead of piling up."

## 5. Tagline reveal (mandatory)
Large type, words activate on scroll:
"Every upgrade is a work order. Every change is a logbook entry. Nothing returns to service until it is signed off."
Max width 680px, Heading 3 (Heading 1 on wide screens).

## 6. How it works (3 steps, each with a real UI fragment)
1. **Inspect.** "Install the GitHub App on the repos you choose. Each repo gets an inspection: Laravel version, PHP constraint, stack, what applies and what it would take."
2. **Open a work order.** "Pick the hop, for example 11 to 13. We run the recipes in a sandbox, apply the repair rules if something breaks, and re-verify up to three times."
3. **Return to service.** "You get a pull request with a work order in the body, squawks on the exact lines that need a person, and the Verified check. Merging stays with you. We never auto merge."

## 7. Rules, not guesses (no AI section)
Heading: "Recipes make the known changes the same way every time"
Body: "Recipes and repair rules make the known changes the same way every time. Nothing is sent to an AI service. What is left is listed for you, with a ready prompt for your own agent if you use one."
Right: a squawk drawer fragment showing severity shapes (square Must fix, triangle Review, circle Note) and a copyable agent prompt.
Honest line: "Expect a few more squawks than a human plus AI pass would leave. We list them instead of guessing."

## 8. For agencies
Heading: "Fifty client apps, one board"
Body: "The hangar board shows every repo, how far behind it is, when support ends and the last work order. Studio and Agency plans add seats and white label client reports `{{client_report_availability}}` (v1)."
Fragment: the hangar board from `mock.html`. Beta line: "Closed beta for agencies: free Studio for 3 months, beta price for life. {{beta_slots_remaining}}" (only once the beta exists).

## 9. Compare (type D block)
Heading: "Against laravelshift.com and doing it with an AI agent"
Ruled table, dated "Prices and features compared on 3 Nov 2026" with source links. Rows from the brief only: price per upgrade, verification, free inspection, where code is processed, agency fleet view, legacy coverage. Honest legacy line: "Upgrading from Laravel 7 or older? Today laravelshift.com covers more legacy versions; our 8.x and 9.x paths ship in v1 and older ones in v2." Never uses their name in our product name; refers to it as laravelshift.com.

## 10. Pricing (rate card, ruled table, annual default)
Intro line (from brief): "Same core jobs, about half the price of laravelshift.com on every comparable plan, with verification included and no third party AI touching your code. Prices compared on 3 Nov 2026; sources linked."
Max three highlighted plans plus Enterprise:
- **Free inspection** $0. Unlimited reports. 1 upgrade PR per month on public open source repos. CTA "Inspect a repo free".
- **One time upgrades**: to Laravel 13.x $9.99, to 12.x $14.99, older jump $19.99 (11.x at launch), Fixer or Tailwind or HTML converter $9.99, small converters $4.99, extended verification +$4.99. "One verified PR, repair pass included, 14 days of re runs on the same branch." CTA "Open upgrade PR".
- **Solo** $49 per repo per year (about $4.13 a month). **Legacy Solo** $74 per repo per 6 months.
- **Studio** $449 per year, unlimited repos, 5 seats, fleet dashboard. **Legacy Studio** $474 per 6 months.
- **Agency** $99 per month, or $999 per year ("2 months free"), unlimited repos and seats, white label reports, priority queue, extended verification on every run. Highlighted with border and label "Best for agencies", not a gradient.
- Over 200 repos or SSO: "Talk to us" Enterprise quote.
Annual toggle states the saving as a number. Currency toggle USD, GBP, CAD shows estimates with the ECB reference date `{{fx_date}}` and the line "Billed in USD". Risk reversal under buttons: "Free inspection first. Cancel at period end. Pause up to 3 months." Refund terms `{{refund_policy}}` until owner decides (logged in DECISIONS).

## 11. Security and code custody
Heading: "Where your code goes, in four lines"
1. "Each run gets its own sandbox with no host mounts. It is destroyed when the run ends."
2. "The sandbox can reach package registries and GitHub, nothing else. Blocked hosts are logged."
3. "Installation tokens are scoped to one repo and expire after the run. The sandbox never holds them."
4. "We do not retain customer code. Logs are kept 30 days with secrets redacted."
Sub-processor list link (payment processor, hosting, database: exact list in `/legal/subprocessors`, generated from ARCHITECTURE). Honest note: Vercel, MongoDB Atlas and Cloudflare are infrastructure sub-processors in the first release and the page says so; the brief's "one sub processor" line is moved to the VPS phase (DECISIONS D-07).

## 12. Proof (hidden until real)
Slot for real merged PRs on open source Laravel apps, the verified rate and the median squawk count. Rendered only when `data/proof.json` has real entries. Until then this section is absent, no placeholders on production. Founder reported facts about laravelshift.com are cited as "founder reported, not verified".

## 13. FAQ (10, plain Q and A, FAQ schema)
1. Will a new tool break my client apps? (No auto merge, Verified check, Unverified stamp when no tests, 50 fixture app regression suite `{{fixture_count}}`, refunds.)
2. What does Verified actually mean? (composer install, asset build and your test suite ran in the sandbox and passed; test counts shown.)
3. What if my repo has no tests? (Amber Unverified stamp, still opens the PR.)
4. Do you clone my private code? (Yes, in an ephemeral sandbox, destroyed after; no code retained; egress allow list.)
5. Does any AI touch my code? (No. Rules based recipes and repair rules. Prompts for your own agent are templates.)
6. I do not have org admin on GitHub. (Request approval email template.)
7. laravelshift.com already works for us. (Honest answer with the dated comparison and the legacy line.)
8. Our AI agent can do this. (Determinism, fewer tokens, scheduling, fleet view; agents can read our prompts.)
9. Which Laravel versions are covered? (10 to 11, 11 to 12, 12 to 13 at launch; 8 and 9 in v1; older in v2.)
10. How does billing and cancelling work? (Stripe, invoices with VAT or GST IDs, cancel at period end, pause up to 3 months.)

## 14. Final CTA
"Find out how far behind your repos are. Inspect a repo free" with the same risk line. Footer: product links, guides, docs, compare, security, legal (privacy, terms, DPA, sub-processors, credits), status, "A BufferSol product", trademark note "Laravel is a trademark of Laravel Holdings Inc. Stepclimb by BufferSol is not affiliated." `{{trademark_text_check}}` to be confirmed with counsel before launch.

## Other marketing pages (M1)
`/pricing` (section 10 expanded with the plan limits), `/security`, `/compare/laravelshift`, `/laravel-12-to-13` and `/laravel-11-to-12` (dated, sourced guide plus CTA), `/guides` index with "Laravel and PHP end of life calendar", `/docs` (MDX), `/legal/*`, branded 404.

## Ship list
Skip link, meta and OG per page, generated OG image with the stamp, favicon set from the torque mark, sitemap, robots, FAQ schema, 390px check, no dead links, focus rings.

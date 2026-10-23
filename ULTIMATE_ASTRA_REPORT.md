# Ultimate Astra fixes — implementation and rollout

Date: 23 October 2026. Branch: `feat/ultimate-astra-fixes`, created from the clean local `dev` branch. All changes remain uncommitted and unstaged. Nothing was pushed or deployed; no live leads were deleted, payments made, or emails sent.

**Completed behavior**

- Review submission waits for the server acknowledgment. A failed or incomplete save keeps the form and image, resets CAPTCHA for retry, shows exactly “Something went wrong saving your review. Please try again.”, and never opens Haven. Closing and double submission are blocked while the request runs.
- Creation now goes through `create-brand-review`. It verifies hCaptcha on the server, creates review/session/access proof in one database transaction, and stores only a hash of the private 32-byte capability. Anonymous browser review/session mutations are revoked by the migration. CAPTCHA verification is bound to the protected creation action rather than a separate browser ceremony.
- Pending creation retains its original submission and credentials for retries and refresh recovery. CAPTCHA is not stored. A large screenshot that exceeds browser storage quota can be reselected while retaining the small ownership credentials. Unsupported images and images over 5 MiB are rejected before they can poison the retry snapshot.
- Screenshots upload to a stable private path after the creation transaction. Failed uploads remain retryable with the same credentials. Ownership is checked again after upload to handle concurrent admin deletion; cleanup failure still requires manual storage cleanup.
- Session sync verifies the session, its review relationship, the review row, and the capability before writing. Database failure returns HTTP500 with `ok:false`. A service-only RPC updates transcript/click state atomically. Browser input cannot overwrite trusted scores, flags, lead classification, or AI steps. Client writes are serialized per session, bounded by UTF-8 bytes, retried at most twice, and expose retry/failure in the drawer. The database rejects older transcript snapshots from replacing newer ones.
- Haven builds prompts on the server. It rejects browser `systemPrompt` fields and system-role messages; bounds request size, history, image type/size and context; and uses saved review/score/flag data for audits. Gemini receives native `systemInstruction`. Moving instructions server-side reduces the exposed instruction boundary; it does not make arbitrary model prompt injection impossible.
- Red audit reviews receive the exact restriction message without a model request. Public support/service conversations remain public and do not inherit audit scores or private audit identity. This is review capability authorization, not a new Supabase Auth account system or mailbox verification.
- The first audit question starts at `AWAITING_DIAGNOSTIC_Q1`. Step parsing now accepts the digits in Q1/Q2, avoiding the previous silent state failure. Returning conversations match their saved credentials; an older scoring response cannot overwrite a newer review's UI.
- Server prompts contain the requested empathy, hesitation, Playbook transformation and no-income-guarantee language. Pushback uses the actual saved evidence rather than inventing an unclear opening when the evidence does not support it.
- Website and social scoring save explicit `valid`, `bad_data`, or `failed` states. Network/provider failure offers retry/proceed. Unreadable, nonsense or legal-only extraction shows no numeric score. Coherent weak content can receive20 or0. Score totals and category ranges must agree. HavenScoreCard renders these states separately.
- Header has the requested compositor transform and backdrop-filter hint. Playbook card uses zinc dots and no main-card price. Checkout uses zinc-900, white/zinc text, minimal borders, dark native controls and muted “Secure checkout via Paystack”. Modal retail price remains ₦9,639. The actual test charge remains **10000 kobo / ₦100**, as previously instructed.
- Admin fetches and displays purchase email, reference, amount, date and thank-you status. Purchase amounts are converted from stored kobo to naira. Confirmed Delete Lead uses the existing admin password gate and a service-only transaction to remove the selected review and associated sessions; purchase financial records remain. Screenshot cleanup failures are reported explicitly. Tables scroll within their container rather than expanding the page. Network errors release controls and failed notes remain retryable.

About and Testimonials video controls, and the entire CookieBanner file, are unchanged from HEAD.

**Validation**

Final full suite: **176 passed, 0 failed, 0 skipped**.

```powershell
$taskTestFiles = @(Get-ChildItem -LiteralPath 'tests' -Filter '*.test.mjs' | ForEach-Object { $_.FullName })
node --test --test-reporter=spec @taskTestFiles
```

Production build: **passed**, using `npm.cmd run build`. Vite reports a large main JavaScript chunk:882.54kB minified /253.36kB gzip. Splitting the admin route and heavy feature code is a recommended follow-up. The initial sandbox build hit a Windows realpath permission error; the approved build outside that sandbox completed successfully.

`git diff --check`: **passed**. Targeted ESLint comparison of changed frontend files against HEAD added no diagnostics; existing errors decreased from33 to27, with the existing one warning retained. Lint is therefore **not clean**. Remaining diagnostics include unused React imports, existing state-setting effects, render purity and drawer hook/component patterns. New screenshot helper and canonical server prompt module pass their targeted lint checks.

Local browser checks covered the checkout at1366px laptop and375px phone widths. It renders without page horizontal overflow, retains a visible payment footer, and keeps its own vertical scroll. No purchase was submitted. Admin data rendering/deletion requires an authenticated staging check; the local automated tests cover its mocked request and state behavior.

The automated edge tests execute the actual handler/shared prompt/ownership code with database and provider boundaries mocked. Scorecard tests render real React markup. They do **not** prove production RLS, SQL execution, gateway settings, provider response quality, deliverability or payment processing. No local PostgreSQL, Docker or Deno runtime was available to execute the migrations.

**Required deployment order**

Use a staging project first, then a short coordinated production rollout. The security migration intentionally revokes the old browser write path; applying it while serving the old frontend will interrupt new review creation. Reverting only the frontend after this migration will not restore that old path.

1. Back up the database and confirm the existing baseline, user-flags and playbook-purchases migrations are present. Do not blindly replay unrelated historical migrations or cron placeholders.
2. This earlier deployment guidance is superseded by FINAL_MASTER_REPORT.md. The current CAPTCHA secret name is `HCAPTCHA_SECRET`, matching the existing live secret. `HCAPTCHA_SITE_KEY` is optional and defaults to the current widget key. Keep existing `GEMINI_API_KEY`, `GROQ_API_KEY` and `ADMIN_PASSWORD`. Gemini now remains disabled unless `GEMINI_BILLING_CONFIRMED=true` after verifying the paid-service configuration. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are server runtime variables. None of these private values belongs in Vite env variables.
3. Manually apply [review_security.sql](C:/Projects/tmh-platform/supabase/migrations/20261023000000_review_security.sql) and then [admin_delete_lead.sql](C:/Projects/tmh-platform/supabase/migrations/20261023000002_admin_delete_lead.sql). The first includes the requested terms/score columns, scoring metadata, private access-proof table, locked-down privileges, creation transaction and sync transaction. The second adds confirmed admin deletion.
4. Deploy exactly the seven functions below. `_shared` modules are bundled dependencies, not separately invoked functions. Preserve `supabase/config.toml`; the new creation endpoint disables gateway JWT verification because it enforces server CAPTCHA/private capability itself. Other existing gateway settings remain as configured.
5. Deploy the tested frontend from this branch in the same rollout window. Frontend deployment remains yours to perform.
6. Run the live checks below before reopening general traffic.

For the existing production project, after signing in to the Supabase CLI:

```powershell
supabase link --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy create-brand-review
supabase functions deploy sync-haven-session
supabase functions deploy haven-chat
supabase functions deploy scrape-website
supabase functions deploy score-social
supabase functions deploy admin-fetch-leads
supabase functions deploy admin-update-lead
```

Use the staging project reference instead for the first rehearsal. The dashboard/CLI deployment and secret workflows are documented by [Supabase deployment](https://supabase.com/docs/guides/functions/deploy) and [Supabase environment variables](https://supabase.com/docs/guides/functions/secrets). hCaptcha's [server verification guide](https://docs.hcaptcha.com/#server) explains the single-use, server-verified token flow implemented here.

**What to test before release, in priority order**

1. Submit one new review with a controlled email and valid CAPTCHA. Confirm exactly one review, one audit session at Q1, and one private access-proof row. Confirm accepted terms have a server timestamp. The drawer must open only after the save/upload succeeds. Never paste access tokens into shared logs or screenshots.
2. Force review creation, transaction and screenshot failures separately. The exact error must appear and the draft/image remain. Retry after restoring the service; repeat after refresh and with browser storage quota exhausted. Confirm no duplicate review/session and that the original saved identity is retained.
3. Verify anonymous direct INSERT/UPDATE/DELETE on review/session tables and anonymous admin-view/token reads fail. Invoke sync/chat/scorers with missing, wrong and cross-review credentials: expect denial before provider requests or writes. Confirm both admin RPCs cannot be executed with anon/authenticated credentials. A valid ownership lookup is not sufficient if actual deployed grants allow another bypass.
4. Check sync HTTP500 on a forced database failure, visible retry/failure notice, successful recovery, and no older transcript overwriting a newer one. Use a long Unicode conversation to check the byte bound. Full local conversation history remains on-device; database transcripts retain a bounded recent window.
5. Score a coherent but weak page, an ordinary good page, legal-only/nonsense extraction, a script-heavy site and an unreachable site. Confirm bad data has no score, failures offer retry/proceed, and a legitimate low or zero score remains visible and agrees with the server record. Repeat the readable/unreadable cases for social screenshots.
6. In a real-model conversation, answer the initial question: no second greeting. Try “I post but nothing happens”, “Let me think”, “Will this make me rich?”, Playbook interest and score pushback. Confirm the requested language, useful continuation, no forced sale, no fabricated evidence, and no visible metadata tags. These are prompt instructions, so real response evaluation is still required.
7. Set a controlled audit review red. Browser-forged white status, score or system prompt must not bypass the server restriction. Test support/service separately; their public scope is intentionally distinct from verified audits. AI flag markers are not a newly implemented automatic moderation pipeline in this task.
8. In Admin, verify purchases against known Paystack records, flags, loaded review count and amounts. At1366px and on phone, test long email/brand/reference values and table scrolling. Cancel deletion first; then delete an explicitly disposable staging lead and confirm sessions/access proof disappear, the correct screenshot is removed, and purchases remain. Force screenshot cleanup failure and verify the warning/manual cleanup path.
9. Run the established controlled ₦100 checkout/webhook/email/private-download flow and booking confirmation flow to catch regressions. The retail display/test-charge mismatch is intentional during testing; decide the actual launch charge explicitly before public sales.
10. Check real iOS/Android keyboards, focus/close behavior, Chrome header compositing, reduced-motion/low-end devices and slow networks. Verify About/Testimonial controls and CookieBanner layering remain as expected.

**Legacy reviews and remaining launch risks**

- Existing reviews predate capability proofs. Their saved drawer now directs the user to `info@themarketinghaven.xyz` and blocks an audit composer without credentials. There is no automatic secure email recovery flow in this change. Clearing browser cache does not remove the database email uniqueness constraint. Use verified team-assisted recovery or, for disposable testing data only, an explicitly confirmed admin reset before testing the same email again. Do not mint a token from an unverified email lookup or silently delete old reviews.
- Individual admin accounts/MFA, rate limits, API cost monitoring and older public email endpoint hardening remain follow-ups from the audit. Inspect or disable unused legacy `send-welcome-email` / `send-booking-confirmation` deployments before launch. The new capability checks do not secure unrelated service-role endpoints.
- Purchase recovery across devices, full booking-event identity/cancellation handling and the review-only polling confirmation gap remain earlier audit findings outside this execution brief. Test and resolve the journeys you intend to promise at launch.
- Admin currently labels and loads at most the newest500 reviews/purchases. Counts, filters and exports describe the loaded set; there is no unlimited server pagination or full API usage dashboard in this change.

**Recommended visual pass, suggested rather than implemented**

1. [HeroSection.jsx](C:/Projects/tmh-platform/src/components/HeroSection.jsx): keep “Here to transform your brand.”, use more deliberate line breaks and a quieter secondary line, show more of the video, and reduce the large glass panel. Add a poster fallback. The current intro animation runs behind the preloader, so a coordinated reveal after loading would have more impact than another animation library.
2. [Preloader.jsx](C:/Projects/tmh-platform/src/components/Preloader.jsx): the forced approximately four-second video is a larger launch friction than the absence of smooth scrolling. Prefer a first-visit treatment with a bounded fallback so a stalled video cannot hold the site indefinitely. This file was reviewed but unchanged.
3. [HavenDrawer.jsx](C:/Projects/tmh-platform/src/components/haven/components/HavenDrawer.jsx) and [ChatMessage.jsx](C:/Projects/tmh-platform/src/components/haven/components/chat/ChatMessage.jsx): reserve glass for the outer drawer; use calmer translucent solid surfaces inside rather than blur on shell, header, footer and every message. Keep typing feedback, readable paragraph widths and restrained transitions. This creates depth while reducing repaint work during chat scrolling.
4. [AboutSection.jsx](C:/Projects/tmh-platform/src/components/AboutSection.jsx): increase small role labels and use a more editorial portrait/spacing rhythm. The public team name “Yakubu Dalil” differs from “Oshioke Dalil” in the existing AI knowledge text; confirm the correct public name before launch. Leave pending video controls intact.
5. [ServiceGrid.jsx](C:/Projects/tmh-platform/src/components/services/ServiceGrid.jsx): distinguish services with numbered layouts and actual work examples instead of three similar cards, icon tiles and blue glows. Specific proof will do more for credibility than additional glass.
6. Reuse the installed Framer Motion for one-time opacity/translate reveals, approximately12–24px travel and180–450ms duration; support reduced motion. Keep large blur and shadows static. Do not add GSAP plus Lenis for this pass; profile a low-end phone first, retain native drawer/modal scrolling, and add smooth scrolling only if testing demonstrates a benefit. Split the large JavaScript bundle and add route/error recovery before expanding animation complexity.

**Changed file inventory**

Modified frontend: `src/App.jsx`; `src/components/ShopSection.jsx`; `src/components/layout/Header.jsx`; `src/components/modals/BrandReviewModal.jsx`; `src/components/haven/context/HavenContext.jsx`; `src/components/haven/config/prompts.js`; `src/components/haven/components/HavenDrawer.jsx`; `src/components/haven/components/HavenScoreCard.jsx`; `src/lib/brandReviewService.js`; `src/lib/havenSessionSync.js`; `src/pages/AdminDashboard.jsx`.

New frontend helper: `src/lib/reviewScreenshot.js`.

Modified backend/config: `supabase/config.toml`; `supabase/functions/admin-fetch-leads/index.ts`; `supabase/functions/admin-update-lead/index.ts`; `supabase/functions/haven-chat/index.ts`; `supabase/functions/score-social/index.ts`; `supabase/functions/scrape-website/index.ts`; `supabase/functions/sync-haven-session/index.ts`.

New backend/shared: `supabase/functions/create-brand-review/index.ts`; `supabase/functions/_shared/review-access.ts`; `supabase/functions/_shared/haven-prompts.js`; `supabase/functions/_shared/haven-request.ts`; `supabase/functions/_shared/haven-scoring.ts`.

New migrations: `supabase/migrations/20261023000000_review_security.sql`; `supabase/migrations/20261023000002_admin_delete_lead.sql`.

Modified tests: `tests/haven-flags-scraper.test.mjs`. New tests: `tests/admin-management.test.mjs`; `tests/haven-scorecard.test.mjs`; `tests/haven-server.test.mjs`; `tests/haven-sync-client.test.mjs`; `tests/review-save-ui.test.mjs`; `tests/review-security.test.mjs`. Documentation: this report.

The large reduction in frontend `prompts.js` is primarily the move of canonical instructions to the new server module. Default `git diff --stat` excludes untracked new files; the inventory above includes them. No dependency or lockfile changes were made.


**Raw Git output**

`git diff --stat` (tracked files; added files are listed in `git status`):

```text
warning: in the working copy of 'src/components/haven/config/prompts.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/components/modals/BrandReviewModal.jsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/lib/brandReviewService.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/lib/havenSessionSync.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'supabase/functions/haven-chat/index.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'supabase/functions/sync-haven-session/index.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'tests/haven-flags-scraper.test.mjs', LF will be replaced by CRLF the next time Git touches it
 src/App.jsx                                        |  75 +-
 src/components/ShopSection.jsx                     | 117 +--
 src/components/haven/components/HavenDrawer.jsx    |  22 +-
 src/components/haven/components/HavenScoreCard.jsx |  30 +-
 src/components/haven/config/prompts.js             | 821 +--------------------
 src/components/haven/context/HavenContext.jsx      | 367 ++++-----
 src/components/layout/Header.jsx                   |   5 +-
 src/components/modals/BrandReviewModal.jsx         | 150 ++--
 src/lib/brandReviewService.js                      | 151 ++--
 src/lib/havenSessionSync.js                        | 178 ++---
 src/pages/AdminDashboard.jsx                       | 165 ++++-
 supabase/config.toml                               |   3 +
 supabase/functions/admin-fetch-leads/index.ts      |  44 +-
 supabase/functions/admin-update-lead/index.ts      |  51 +-
 supabase/functions/haven-chat/index.ts             | 105 ++-
 supabase/functions/score-social/index.ts           | 109 ++-
 supabase/functions/scrape-website/index.ts         | 135 ++--
 supabase/functions/sync-haven-session/index.ts     | 188 +----
 tests/haven-flags-scraper.test.mjs                 | 288 ++++----
 19 files changed, 1096 insertions(+), 1908 deletions(-)
```

`git status`:

```text
On branch feat/ultimate-astra-fixes
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   src/App.jsx
	modified:   src/components/ShopSection.jsx
	modified:   src/components/haven/components/HavenDrawer.jsx
	modified:   src/components/haven/components/HavenScoreCard.jsx
	modified:   src/components/haven/config/prompts.js
	modified:   src/components/haven/context/HavenContext.jsx
	modified:   src/components/layout/Header.jsx
	modified:   src/components/modals/BrandReviewModal.jsx
	modified:   src/lib/brandReviewService.js
	modified:   src/lib/havenSessionSync.js
	modified:   src/pages/AdminDashboard.jsx
	modified:   supabase/config.toml
	modified:   supabase/functions/admin-fetch-leads/index.ts
	modified:   supabase/functions/admin-update-lead/index.ts
	modified:   supabase/functions/haven-chat/index.ts
	modified:   supabase/functions/score-social/index.ts
	modified:   supabase/functions/scrape-website/index.ts
	modified:   supabase/functions/sync-haven-session/index.ts
	modified:   tests/haven-flags-scraper.test.mjs

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	ULTIMATE_ASTRA_REPORT.md
	src/lib/reviewScreenshot.js
	supabase/functions/_shared/
	supabase/functions/create-brand-review/
	supabase/migrations/20261023000000_review_security.sql
	supabase/migrations/20261023000002_admin_delete_lead.sql
	tests/admin-management.test.mjs
	tests/haven-scorecard.test.mjs
	tests/haven-server.test.mjs
	tests/haven-sync-client.test.mjs
	tests/review-save-ui.test.mjs
	tests/review-security.test.mjs

no changes added to commit (use "git add" and/or "git commit -a")
```


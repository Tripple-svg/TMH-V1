# Haven strategic pivot: implementation and handover

Date: 28 October 2026 (Africa/Lagos)  
Workspace: `C:/Projects/tmh-platform`  
Branch: `feat/strategic-pivot-rubrics` (created from `dev`)

The local implementation is complete and validated for review. Nothing was committed, pushed, deployed to Supabase, or published to the frontend during this task. The SQL checks used an isolated in-memory PostgreSQL database. No live payment or email was sent. Production migration, deployment, account availability and real-device verification remain separate steps below.

## What changed

### 1. Haven's decision structure and voice

- Replaced the rigid foundational/operational sales sequence and mandatory question count with a persisted decision state: need, complexity, preference, evidence, missing facts, permission, pending action and last action.
- Evidence for a model-proposed decision must quote server-saved user statements. A generated routing marker alone cannot establish a business need. Existing step identifiers remain compatible with saved conversations.
- Specific requests for TMH to implement work can open the call route without repetitive qualification. A vague call request can receive a useful scope question. A learning preference does not turn technical implementation into a Playbook problem.
- Haven can give a useful answer or bounded next step without recommending either paid option. When a recommendation fits, permission is requested once. Acceptance continues that invitation; it does not restart diagnosis.
- Removed unsolicited prices and purchase pitches from book recommendations. The existing Shop button handles contents and checkout. Direct price questions still receive the correct ₦9,639 answer.
- Added practical Nigerian business context: actual ordering channel, WhatsApp, payment confirmation, delivery area/fees, proof and fulfilment. No forced slang, invented lost revenue, fake urgency or guaranteed outcomes. Product type, grammar, income and headcount do not decide someone's worth or route.
- Support answers access, download, billing, navigation and privacy questions first. Human support goes to the real contact details, not automatically to a strategy call. A separately expressed commercial need can be addressed as a topic change. Team/service inquiries get bounded scoping help.
- Added curated platform, service, team, contact and purchase-recovery knowledge. Haven states which actions it can actually perform; it cannot claim to have issued a refund, repaired access or created a ticket without a real tool result.
- Preserved server-owned per-session history and validated conversation memory. Provider context uses recent saved turns and memory, not a browser-authored system prompt. The existing limits are 200 saved messages and up to 40 recent provider messages / 24,000 characters, plus the bounded memory.
- Retained private chapter guidance for verified buyers and public, brief concepts for others. Reviewed the supplied Playbook PDF, including Chapter 5, The Shift From Knowing to Doing, and the TMH Execution Framework. No PDF was copied into the public frontend. Production bundle inspection found no private chapter-note block.
- Added an explicit comment that improvements come from manually reviewed feedback and regression cases. No fine-tuning, autonomous training or automatic prompt rewriting was built.
- Added a guard against the reported canned solidarity response to an unsupported complaint about TMH. Genuine criticism is not automatically treated as abuse. Hidden decision metadata, including malformed multiline output, is removed from user/admin display.

### 2. Honest scoring and source correction

Website categories are Clarity, Trust signals, Positioning and Conversion path. Social categories are Profile setup, Visible content direction, Value proposition and Conversion readiness. Each is worth 25 points.

- Each category uses five anchored 0–5 checks. The parser verifies category totals, the overall total, rubric version, observation, excerpt and practical improvement. Website excerpts must occur in the supplied extracted text.
- Removed technical performance, engagement quality and posting-frequency assessment from new scores. An extracted CTA can establish a stated next step; it cannot establish that the button works or checkout converts.
- Insufficient material returns `insufficient_evidence` with no numeric score. Low but readable material can still receive a real low score. Too little text, legal/navigation boilerplate, blocked readers, oversized pages, timeouts and provider failures have different explanations. Reader failure does not prove a weak business or a video-heavy site.
- The scorecard starts with the total, scope explanation and first observation. Detailed categories and evidence are optional to expand. Removed the invented pass mark. Previous saved rubrics are labelled as previous methods rather than relabelled as new scores.
- Added the requested “Wrong website/screenshot? Try Again” form and a “Review source” control after entering chat. Corrections replace the current review source without refreshing or erasing the conversation.
- Source changes require the existing private review capability. The access-recovery security flow remains intact. Restricted reviews cannot correct a source to bypass access rules.
- Private screenshots remain in the private bucket. A correction uploads a new review-scoped object, commits with an optimistic revision, and then removes the old object. Failed/conflicting saves clean up the replacement instead.
- Scoring uses the stored screenshot, including after reload, instead of trusting a browser-swapped image. Revision checks prevent a late score from overwriting newer input. Corrections clear derived scoring/routing decisions and source-dependent problem/attempt notes, while retaining the owner’s business/audience/goal/constraint/preference notes, transcript and ownership proof.
- Choosing None yet skips scoring and opens conversation. Website and screenshot instructions now describe the actual review scope.

### 3. Gemini 503, retry conflicts and voice input

`gemini_http_503` reports provider unavailability. It does not establish that cumulative lifetime tokens were exhausted. Google's current troubleshooting guidance recommends bounded transient retries with backoff/jitter: [Google’s troubleshooting guide](https://ai.google.dev/gemini-api/docs/troubleshooting).

- Gemini remains primary; Groq remains the text fallback. Keys are trimmed, the enabled flag is normalized, and an optional `models/` prefix is normalized in model configuration. The configured/default model is not silently exchanged for another model.
- A transient Gemini HTTP 500/502/503/504 gets one short retry with jitter before fallback. A long Retry-After is not ignored for an immediate retry. Quota errors do not trigger a tight retry loop. Image scoring does not pretend that a text fallback can see a screenshot.
- Failed chat turns retain safe provider codes and bounded cooldowns. The UI shows when a saved turn can be retried. The same saved request ID is reused, preventing duplicate user turns on response loss.
- Added a fresh attempt ID for each processing attempt. Completion and failure writes are fenced by that ID, so a cancelled or superseded request cannot write a late answer over a newer attempt.
- Stop requests cancel the owned server turn as well as stopping the local request. Dismissing a failed retry clears its notice and releases available pending work. Stopped responses cannot resurrect a retry banner or append a late local reply.
- A stale processing lease can be reclaimed; an active turn in the same conversation remains serialized. The frontend timeout is 65 seconds and the processing lease is 75 seconds.
- Added the admin “Check AI setup” action. It checks configuration and model metadata without sending a conversation or generating tokens. A successful metadata check does not prove inference quota, billing eligibility or answer quality.
- Fixed speech-result duplication by rebuilding transcripts from result indices instead of repeatedly appending final results. Interim replacements, typed prefixes, stop/restart, stale callbacks and the 4,000-character limit are covered. Voice input does not send a message automatically.
- Reduced composer clutter: attachment rules remain available on the attachment control; the character counter is visually quiet until needed. Existing iPhone visual-viewport sizing, background locking and gesture containment remain in place. Physical iPhone keyboard behaviour still needs confirmation by your co-founder.

### 4. Email and purchase follow-up

- New email records use the v3 sign-off “Your friends over at Team Haven” and “Building with intention.” Existing queued v1/v2 payloads keep their original bytes and idempotency keys, avoiding duplicate/conflicting retries.
- Welcome email copy reflects website, social or None yet. Admins can see its status and retry the stored recipient safely. A sender response alone cannot mark delivery accepted without a saved acknowledgement.
- Purchase emails retain the styled Access Your Playbook button to `https://themarketinghaven.xyz/#shop`, clearer recovery wording and guidance wording. Fresh verified checkout still opens directly without OTP. OTP is for recovery.
- Team flag recipients remain BOTH `francis.teamhaven@gmail.com` and `paschal.tmh@gmail.com`. Alerts retain the known name, source and session/visitor identifiers. A guest is not assigned a fabricated email or name.
- Added one optional purchase check-in, due 24 hours after Paystack's paid timestamp. Subject: “Did you get a chance to read The Playbook?” It mentions the correct Chapter 5, encourages one practical action, and has an Explore TMH Services button.
- Checkout asks explicit permission for that single follow-up, default unchecked. Signed Paystack metadata records the opt-in/version. Old purchases, recovery and re-downloads do not silently enrol someone. The privacy notice reflects this feature.
- Personalization uses Paystack's supplied first name when available; otherwise “Hey there”. No unverified join between a billing email and another person's profile.
- The private queue has a unique purchase, bounded leases/attempts, frozen payload, stable provider idempotency key, retry delays and a limited retry window. Provider acceptance is saved before claiming delivery success; a stored provider ID can repair a failed marker without resending.
- Added a signed cancellation endpoint. GET shows a confirmation; POST cancels. The link cannot reveal the queue or change purchase access. Accepted does not mean delivered/read in an inbox.
- Added separate Cron/Vault setup SQL. The worker runs on due work; it cannot promise exact inbox arrival at the 24-hour instant. Scheduling is not installed automatically.
- Preserved the agreed one download action per visit, with future recovery available. Receipt identifiers alone do not unlock the book; inbox proof is required without a valid saved checkout grant. The actual charge remains ₦9,639 / 963,900 kobo.

### 5. Public UI and admin workspace

- Your About test asset now previews muted and loops in its existing glass-edged frame. The transparent Play control is centred. The volume icon starts the same inline player from the beginning with sound.
- Playback stays inside that frame. Preview controls disappear, native controls become available, tapping the picture pauses/resumes, and X returns to the muted looping preview. No new popup, page lock or separate player is opened.
- Reduced-motion/save-data preferences suppress the background preview; explicit playback remains available. Offscreen/hidden video is paused. Loading errors are actionable.
- Kept the mature visual structure. Hero/form copy describes what Haven can actually inspect. Added the real footer email, WhatsApp link and Lagos, Nigeria, plus a concise agency description.
- Preserved existing natural image colour, image placeholders/early warming and testimonial transitions. Pending videos/pictures are still pending; play affordances were not replaced with fabricated material. No extra animation framework was added.
- Admin has current-vs-previous score labels, mobile welcome-email badges/retry, the full public team-name owner picker, readable operational counts, provider setup diagnostics, and a purchase follow-up queue summary.
- Existing Leads, Purchases, Bookings, Team Inquiries, Support and Service tabs remain separate. Linked transcripts remain under their lead. Counts explicitly describe the loaded record scope (newest 500 per collection), rather than pretending to be lifetime totals. Provider reply counts are not token/billing figures.
- Owner assignment records a label; it does not email a teammate automatically. No private teammate addresses were invented. A notification/acceptance workflow can be added once actual recipients and operating rules are agreed; it was optional in your brief.

## Validation results

| Check | Result |
| --- | --- |
| `node --test tests/*.test.mjs` | 367 passed, 0 failed, 0 skipped |
| Your exact earlier command: `node --test tests/backend-tasks.test.mjs tests/booking-ui.test.mjs tests/playbook-ui.test.mjs` | 27 passed, 0 failed |
| Actual migrations in isolated PGlite/PostgreSQL | 32 passed, 0 failed |
| Deno checks for 14 affected function entrypoints | Passed |
| `npm.cmd run build` | Passed; existing large-chunk warning remains (main JS roughly 846 kB before gzip) |
| `git diff --check` | Passed; Git may print its normal LF-to-CRLF notice for the About component |
| ESLint | Still fails: 45 errors, 2 warnings; baseline was 51 errors, 2 warnings. No newly introduced diagnostic remains in the comparison. |

There are no failures in the final requested test command to paste. The linter is not green; most remaining findings concern existing unused imports, empty catches, effect/state patterns, fast-refresh exports and an older review-chat component. This task does not certify all repository lint debt as resolved.

Browser checks used actual components. Homepage/checkout/video were exercised in the local application; score correction/admin used isolated fake records and mocked transport, never real customer data or live email. Confirmed checkout/recovery tab separation, optional follow-up unchecked, source replacement interaction, mobile widths without horizontal document overflow, admin diagnostics/queue layout, inline sound playback, tap-to-pause, X-to-preview and zero horizontal/vertical centring difference for the Play control. Temporary root QA fixtures were removed.

Local logs and visual proof are in `C:/Projects/tmh-platform/node_modules/.cache/tmh-oct27/`: `unit.log`, `requested-tests.log`, `sql.log`, `deno.log`, `build.log`, `lint.json`, `lint-summary.txt`, `lint-comparison.json`, `story-inline-preview.png`, and `admin-mobile.png`. These are ignored working artifacts, not release assets. No credentials are contained in the reported diagnostics.

## Deployment order (not performed)

1. Apply these three migrations once, in order, after confirming all earlier migrations already deployed:
   - `C:/Projects/tmh-platform/supabase/migrations/20261027000000_strategic_scoring.sql`
   - `C:/Projects/tmh-platform/supabase/migrations/20261027000001_haven_turn_reliability.sql`
   - `C:/Projects/tmh-platform/supabase/migrations/20261027000002_purchase_followup.sql`
2. Deploy affected functions together after the migrations. The shared-module changes matter even when an entry file itself has no diff:
   `haven-chat`, `scrape-website`, `score-social`, `update-review-source`, `admin-fetch-leads`, `admin-update-lead`, `paystack-webhook`, `send-purchase-thankyou`, `send-welcome-email`, `send-flag-alert`, `send-flag-customer`, `request-playbook-recovery`, `send-purchase-followup`, `playbook-followup-unsubscribe`.
   These functions perform their own capability, admin-password, signed-webhook or internal-service authentication. Preserve their configured gateway settings; the three new public-gateway endpoints are listed with `verify_jwt = false` in config and still require their own proof/internal authentication where appropriate. For the existing custom-auth endpoints, use the project's established deployment settings.
3. Verify server-only secrets in the project: `GEMINI_ENABLED=true`, `GEMINI_API_KEY`, the exact supported `GEMINI_MODEL` for your account, optional `GROQ_API_KEY`/`GROQ_MODEL`, `RESEND_API_KEY`, verified sender `info@themarketinghaven.xyz` (or configured sender on that verified domain), `PAYSTACK_SECRET_KEY`, and existing Supabase/admin credentials. `PURCHASE_FOLLOWUP_UNSUBSCRIBE_SECRET` is optional but a stable long random secret is preferable to relying on the service-key fallback. Do not place any of these in VITE variables or Git. Billing is an account setting, not a new invented model ID.
4. Enable Supabase Cron/pg_net/Vault, create the two named Vault secrets privately, then run `C:/Projects/tmh-platform/supabase/operations/schedule-playbook-followup.sql`. Check job runs and private HTTP responses. The scheduling SQL needs the real Supabase extensions; the offline SQL fixture does not install or exercise a live scheduler.
5. Deploy the frontend only after the new backend contract is available and you finish staging checks. Include your existing untracked `public/Test About.mp4` if this temporary video is intended for that release. Replace it with the final story video before public launch when ready.
6. Verify the existing Paystack live webhook still points to `https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/paystack-webhook`, with the matching live secret in Supabase. No webhook URL was changed in this task.

Live Supabase deployment/database access was not connected in this session. Consequently migrations, scheduler activation, actual Gemini generation/quota and real inbox delivery cannot be marked verified here. No live QA email has been sent in this run. The approved QA inbox remains `francis.teamhaven@gmail.com`; both flag alert recipients remain configured as requested.

## What you and three beta owners should test

Run these against the same deployed frontend/backend version. Keep screenshots, the review/session ID and approximate time for a failure; never send API keys, access tokens or OTPs in chat.

1. **Website owner:** submit a useful website, read the evidence and challenge a finding. Replace a wrong URL. Check that the old score is removed, the new result is saved, and reopening chat retains the conversation without treating the old source as current. Try a blocked/short/legal-only page: no fabricated numeric score or invented reason.
2. **Social seller:** submit a clear screenshot, then a cropped/unreadable one. Replace it without reload. Haven should discuss only the visible crop, not invent frequency, engagement history or account sales. Confirm it asks about the actual buying channel and obstacles.
3. **No online presence:** choose None yet. Go straight to chat without a website failure card. Describe a real business, repeat a detail later and correct it. Check whether Haven remembers and adapts rather than repeating a questionnaire.
4. **Route quality:** describe a real learning gap and accept a resource recommendation. It should connect the book to the stated need, show the Shop action, and avoid volunteering a price or another overview loop. Ask price directly: ₦9,639. Separately ask for TMH to rebuild a website: relevant call route, no compulsory two-question ritual. Decline: no pressure or automatic alternative pitch.
5. **Support:** report a broken download, a delayed OTP and missing review proof. Get actual steps and honest limits, not an upsell or a fake repair. Ask for a person: real contact, no strategy booking unless you introduce a separate service need. Test Talk to Our Team and confirm the transcript lands in Team Inquiries and under a linked lead where applicable.
6. **Failure/retry:** test with a slow/interrupted connection. Retry the same saved message, stop a reply, dismiss a failed retry and continue. No duplicate user turn, stale late answer or endless 409. Check AI setup for safe diagnostics, then perform an actual conversation to establish inference availability.
7. **Purchase:** the actual charge is ₦9,639. A fresh verified payment opens the download directly; a different device uses recovery OTP. Wrong email/reference/code, expired code and replayed code must fail safely. A download can be recovered on a future visit; there is no permanent one-download lock. Use the approved inbox for mail QA.
8. **Email/automation:** confirm a new welcome for each presence type, purchase receipt button and correct sign-off, team alerts in BOTH team inboxes, and the customer restriction notice only when an email is known. Check-in enrolment must occur only after explicit opt-in, and only once. Verify due timing, retry/acceptance status, opt-out and no re-enrolment on recovery. Do not accelerate real buyers' queues for a test.
9. **Bookings/admin:** complete a Calendly booking and cancellation; confirm actual booking rows, source/linkage and team-inquiry separation. A click alone is not a booking. Retry a pending review email and verify the saved status, not just a toast. Review restrictions/clears in the original chat and refresh the transcript. Keep the mobile table/card presentation readable.
10. **Physical iPhone:** open the drawer, focus input, rotate, scroll a long conversation, close the keyboard, switch chats and close/reopen the drawer. The background must stay locked while the drawer is open and return to its prior position on close. The keyboard necessarily reduces available height; look for clipping or unreachable controls, not merely movement.
11. **Video/images/accessibility:** play inline from either preview control, pause/resume by tapping, use native controls, close with X/Escape, and verify the centred transparent button. Test reduced motion, slow image loading, light/dark themes and an unavailable asset. Check mail/WhatsApp links without submitting private data.

Beta feedback should measure whether the owner can explain the specific useful next step in their own words, whether evidence is accurate, whether the recommendation fits, whether any question was repeated, and whether the proposed action is actually completed. Routing/evidence tests and a stronger prompt do not prove universal model quality or product-market fit. Use those real sessions to manually improve the policy and regression cases before public launch.

## Remaining priorities before launch

- P0: coordinated live migration/deployment, successful real Gemini responses, paid-account/privacy settings as intended, new-price checkout + recovery, both flag inboxes, actual booking sync and physical iPhone confirmation.
- P1: evaluate real conversations across the three owner types; investigate every wrong score, repeated question, inappropriate route or unexplained provider failure. The admin setup check alone is not this evidence.
- P1: clear remaining lint debt and reduce the existing large frontend bundle as a separate focused cleanup. Keep the validated behaviours covered.
- P2: deeper owner-assignment notifications, wider-than-500 admin pagination/reporting, refund/dispute operations and measured conversion economics once there is real volume. No new app, custom model or autonomous training pipeline is needed for this handover.

## Exact file inventory

All implementation changes and new files are listed below. `public/Test About.mp4` was already your untracked asset when work began; it was referenced, not edited. The handover report is new. Ignored test fixtures/logs and generated `dist` are excluded.

### Modified tracked files

- [scripts/check-final-migrations.mjs](<C:/Projects/tmh-platform/scripts/check-final-migrations.mjs>)
- [src/components/AboutSection.jsx](<C:/Projects/tmh-platform/src/components/AboutSection.jsx>)
- [src/components/HeroSection.jsx](<C:/Projects/tmh-platform/src/components/HeroSection.jsx>)
- [src/components/ShopSection.jsx](<C:/Projects/tmh-platform/src/components/ShopSection.jsx>)
- [src/components/about/AboutStoryVideo.jsx](<C:/Projects/tmh-platform/src/components/about/AboutStoryVideo.jsx>)
- [src/components/admin/InquiryWorkflow.jsx](<C:/Projects/tmh-platform/src/components/admin/InquiryWorkflow.jsx>)
- [src/components/haven/components/HavenDrawer.jsx](<C:/Projects/tmh-platform/src/components/haven/components/HavenDrawer.jsx>)
- [src/components/haven/components/HavenScoreCard.jsx](<C:/Projects/tmh-platform/src/components/haven/components/HavenScoreCard.jsx>)
- [src/components/haven/components/chat/ChatInput.jsx](<C:/Projects/tmh-platform/src/components/haven/components/chat/ChatInput.jsx>)
- [src/components/haven/context/HavenContext.jsx](<C:/Projects/tmh-platform/src/components/haven/context/HavenContext.jsx>)
- [src/components/layout/Footer.jsx](<C:/Projects/tmh-platform/src/components/layout/Footer.jsx>)
- [src/components/modals/BrandReviewModal.jsx](<C:/Projects/tmh-platform/src/components/modals/BrandReviewModal.jsx>)
- [src/pages/AdminDashboard.jsx](<C:/Projects/tmh-platform/src/pages/AdminDashboard.jsx>)
- [src/pages/PrivacyPage.jsx](<C:/Projects/tmh-platform/src/pages/PrivacyPage.jsx>)
- [supabase/config.toml](<C:/Projects/tmh-platform/supabase/config.toml>)
- [supabase/functions/_shared/email-template.js](<C:/Projects/tmh-platform/supabase/functions/_shared/email-template.js>)
- [supabase/functions/_shared/haven-memory.js](<C:/Projects/tmh-platform/supabase/functions/_shared/haven-memory.js>)
- [supabase/functions/_shared/haven-model.ts](<C:/Projects/tmh-platform/supabase/functions/_shared/haven-model.ts>)
- [supabase/functions/_shared/haven-prompts.js](<C:/Projects/tmh-platform/supabase/functions/_shared/haven-prompts.js>)
- [supabase/functions/_shared/haven-routing.js](<C:/Projects/tmh-platform/supabase/functions/_shared/haven-routing.js>)
- [supabase/functions/_shared/haven-scoring.ts](<C:/Projects/tmh-platform/supabase/functions/_shared/haven-scoring.ts>)
- [supabase/functions/_shared/review-access.ts](<C:/Projects/tmh-platform/supabase/functions/_shared/review-access.ts>)
- [supabase/functions/admin-fetch-leads/index.ts](<C:/Projects/tmh-platform/supabase/functions/admin-fetch-leads/index.ts>)
- [supabase/functions/admin-update-lead/index.ts](<C:/Projects/tmh-platform/supabase/functions/admin-update-lead/index.ts>)
- [supabase/functions/haven-chat/index.ts](<C:/Projects/tmh-platform/supabase/functions/haven-chat/index.ts>)
- [supabase/functions/paystack-webhook/index.ts](<C:/Projects/tmh-platform/supabase/functions/paystack-webhook/index.ts>)
- [supabase/functions/score-social/index.ts](<C:/Projects/tmh-platform/supabase/functions/score-social/index.ts>)
- [supabase/functions/scrape-website/index.ts](<C:/Projects/tmh-platform/supabase/functions/scrape-website/index.ts>)
- [supabase/functions/send-flag-alert/index.ts](<C:/Projects/tmh-platform/supabase/functions/send-flag-alert/index.ts>)
- [supabase/functions/send-flag-customer/index.ts](<C:/Projects/tmh-platform/supabase/functions/send-flag-customer/index.ts>)
- [supabase/functions/send-welcome-email/index.ts](<C:/Projects/tmh-platform/supabase/functions/send-welcome-email/index.ts>)
- [tests/admin-workspace.test.mjs](<C:/Projects/tmh-platform/tests/admin-workspace.test.mjs>)
- [tests/haven-flags-scraper.test.mjs](<C:/Projects/tmh-platform/tests/haven-flags-scraper.test.mjs>)
- [tests/haven-routing.test.mjs](<C:/Projects/tmh-platform/tests/haven-routing.test.mjs>)
- [tests/haven-scorecard.test.mjs](<C:/Projects/tmh-platform/tests/haven-scorecard.test.mjs>)
- [tests/haven-server.test.mjs](<C:/Projects/tmh-platform/tests/haven-server.test.mjs>)
- [tests/paystack-purchases.test.mjs](<C:/Projects/tmh-platform/tests/paystack-purchases.test.mjs>)
- [tests/playbook-guidance.test.mjs](<C:/Projects/tmh-platform/tests/playbook-guidance.test.mjs>)

### New/untracked files

- [STRATEGIC_PIVOT_REPORT_20261028.md](<C:/Projects/tmh-platform/STRATEGIC_PIVOT_REPORT_20261028.md>)
- [public/Test About.mp4](<C:/Projects/tmh-platform/public/Test About.mp4>)
- [src/lib/tmhPublicInfo.js](<C:/Projects/tmh-platform/src/lib/tmhPublicInfo.js>)
- [supabase/functions/_shared/haven-knowledge.js](<C:/Projects/tmh-platform/supabase/functions/_shared/haven-knowledge.js>)
- [supabase/functions/_shared/provider-request.ts](<C:/Projects/tmh-platform/supabase/functions/_shared/provider-request.ts>)
- [supabase/functions/_shared/purchase-followup.ts](<C:/Projects/tmh-platform/supabase/functions/_shared/purchase-followup.ts>)
- [supabase/functions/_shared/scoring-rubric.js](<C:/Projects/tmh-platform/supabase/functions/_shared/scoring-rubric.js>)
- [supabase/functions/playbook-followup-unsubscribe/index.ts](<C:/Projects/tmh-platform/supabase/functions/playbook-followup-unsubscribe/index.ts>)
- [supabase/functions/send-purchase-followup/index.ts](<C:/Projects/tmh-platform/supabase/functions/send-purchase-followup/index.ts>)
- [supabase/functions/update-review-source/index.ts](<C:/Projects/tmh-platform/supabase/functions/update-review-source/index.ts>)
- [supabase/migrations/20261027000000_strategic_scoring.sql](<C:/Projects/tmh-platform/supabase/migrations/20261027000000_strategic_scoring.sql>)
- [supabase/migrations/20261027000001_haven_turn_reliability.sql](<C:/Projects/tmh-platform/supabase/migrations/20261027000001_haven_turn_reliability.sql>)
- [supabase/migrations/20261027000002_purchase_followup.sql](<C:/Projects/tmh-platform/supabase/migrations/20261027000002_purchase_followup.sql>)
- [supabase/operations/schedule-playbook-followup.sql](<C:/Projects/tmh-platform/supabase/operations/schedule-playbook-followup.sql>)
- [tests/about-video.test.mjs](<C:/Projects/tmh-platform/tests/about-video.test.mjs>)
- [tests/admin-diagnostics.test.mjs](<C:/Projects/tmh-platform/tests/admin-diagnostics.test.mjs>)
- [tests/admin-email-status.test.mjs](<C:/Projects/tmh-platform/tests/admin-email-status.test.mjs>)
- [tests/chat-voice.test.mjs](<C:/Projects/tmh-platform/tests/chat-voice.test.mjs>)
- [tests/purchase-followup.test.mjs](<C:/Projects/tmh-platform/tests/purchase-followup.test.mjs>)

## Exact Git outputs

`git diff --stat` (tracked files only; Git does not include untracked additions here):

```text
 scripts/check-final-migrations.mjs                 |  85 +-
 src/components/AboutSection.jsx                    |  10 +-
 src/components/HeroSection.jsx                     |   2 +-
 src/components/ShopSection.jsx                     |   7 +
 src/components/about/AboutStoryVideo.jsx           | 160 ++--
 src/components/admin/InquiryWorkflow.jsx           |   3 +-
 src/components/haven/components/HavenDrawer.jsx    |  20 +-
 src/components/haven/components/HavenScoreCard.jsx | 357 ++------
 src/components/haven/components/chat/ChatInput.jsx |  92 +-
 src/components/haven/context/HavenContext.jsx      | 104 ++-
 src/components/layout/Footer.jsx                   |  21 +-
 src/components/modals/BrandReviewModal.jsx         |   4 +-
 src/pages/AdminDashboard.jsx                       | 101 ++-
 src/pages/PrivacyPage.jsx                          |   1 +
 supabase/config.toml                               |   9 +
 supabase/functions/_shared/email-template.js       |  18 +-
 supabase/functions/_shared/haven-memory.js         |   2 +-
 supabase/functions/_shared/haven-model.ts          |   4 +-
 supabase/functions/_shared/haven-prompts.js        | 950 +++++----------------
 supabase/functions/_shared/haven-routing.js        | 366 ++++++--
 supabase/functions/_shared/haven-scoring.ts        |  41 +-
 supabase/functions/_shared/review-access.ts        |  13 +
 supabase/functions/admin-fetch-leads/index.ts      |  41 +-
 supabase/functions/admin-update-lead/index.ts      |  29 +
 supabase/functions/haven-chat/index.ts             |  78 +-
 supabase/functions/paystack-webhook/index.ts       |  22 +-
 supabase/functions/score-social/index.ts           | 122 +--
 supabase/functions/scrape-website/index.ts         | 102 +--
 supabase/functions/send-flag-alert/index.ts        |   6 +-
 supabase/functions/send-flag-customer/index.ts     |   5 +-
 supabase/functions/send-welcome-email/index.ts     |  14 +-
 tests/admin-workspace.test.mjs                     |   3 +-
 tests/haven-flags-scraper.test.mjs                 |  45 +-
 tests/haven-routing.test.mjs                       | 253 ++++--
 tests/haven-scorecard.test.mjs                     |  32 +-
 tests/haven-server.test.mjs                        | 179 +++-
 tests/paystack-purchases.test.mjs                  |  25 +-
 tests/playbook-guidance.test.mjs                   |   2 +-
 38 files changed, 1704 insertions(+), 1624 deletions(-)
```

`git status`:

```text
On branch feat/strategic-pivot-rubrics
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   scripts/check-final-migrations.mjs
	modified:   src/components/AboutSection.jsx
	modified:   src/components/HeroSection.jsx
	modified:   src/components/ShopSection.jsx
	modified:   src/components/about/AboutStoryVideo.jsx
	modified:   src/components/admin/InquiryWorkflow.jsx
	modified:   src/components/haven/components/HavenDrawer.jsx
	modified:   src/components/haven/components/HavenScoreCard.jsx
	modified:   src/components/haven/components/chat/ChatInput.jsx
	modified:   src/components/haven/context/HavenContext.jsx
	modified:   src/components/layout/Footer.jsx
	modified:   src/components/modals/BrandReviewModal.jsx
	modified:   src/pages/AdminDashboard.jsx
	modified:   src/pages/PrivacyPage.jsx
	modified:   supabase/config.toml
	modified:   supabase/functions/_shared/email-template.js
	modified:   supabase/functions/_shared/haven-memory.js
	modified:   supabase/functions/_shared/haven-model.ts
	modified:   supabase/functions/_shared/haven-prompts.js
	modified:   supabase/functions/_shared/haven-routing.js
	modified:   supabase/functions/_shared/haven-scoring.ts
	modified:   supabase/functions/_shared/review-access.ts
	modified:   supabase/functions/admin-fetch-leads/index.ts
	modified:   supabase/functions/admin-update-lead/index.ts
	modified:   supabase/functions/haven-chat/index.ts
	modified:   supabase/functions/paystack-webhook/index.ts
	modified:   supabase/functions/score-social/index.ts
	modified:   supabase/functions/scrape-website/index.ts
	modified:   supabase/functions/send-flag-alert/index.ts
	modified:   supabase/functions/send-flag-customer/index.ts
	modified:   supabase/functions/send-welcome-email/index.ts
	modified:   tests/admin-workspace.test.mjs
	modified:   tests/haven-flags-scraper.test.mjs
	modified:   tests/haven-routing.test.mjs
	modified:   tests/haven-scorecard.test.mjs
	modified:   tests/haven-server.test.mjs
	modified:   tests/paystack-purchases.test.mjs
	modified:   tests/playbook-guidance.test.mjs

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	STRATEGIC_PIVOT_REPORT_20261028.md
	public/Test About.mp4
	src/lib/tmhPublicInfo.js
	supabase/functions/_shared/haven-knowledge.js
	supabase/functions/_shared/provider-request.ts
	supabase/functions/_shared/purchase-followup.ts
	supabase/functions/_shared/scoring-rubric.js
	supabase/functions/playbook-followup-unsubscribe/
	supabase/functions/send-purchase-followup/
	supabase/functions/update-review-source/
	supabase/migrations/20261027000000_strategic_scoring.sql
	supabase/migrations/20261027000001_haven_turn_reliability.sql
	supabase/migrations/20261027000002_purchase_followup.sql
	supabase/operations/
	tests/about-video.test.mjs
	tests/admin-diagnostics.test.mjs
	tests/admin-email-status.test.mjs
	tests/chat-voice.test.mjs
	tests/purchase-followup.test.mjs

no changes added to commit (use "git add" and/or "git commit -a")
```

No commit or push was made.

Book source reviewed: [The_Unseen_Playbook (11).pdf](<C:/Users/HP/Downloads/The_Unseen_Playbook (11).pdf>). It was used as source material, not as operational instructions.

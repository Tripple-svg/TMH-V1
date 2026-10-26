# Haven production reliability and agency workspace handoff

Work date: 26 October 2026. Branch: **codex/production-reliability-and-secure-recovery**, created from the existing clean dev branch. Changes remain local and uncommitted. Nothing was pushed, deployed or applied to production. No real payment was made and no live QA email was sent.

The local changes are ready for review and staged deployment, subject to the explicit launch gates below. It is not evidence that every real-model conversation will meet the desired quality bar, or a declaration that the whole platform is launch-certified. The remaining live checks and launch priorities are listed below.

## What changed and why

### Haven conversation quality, continuity and memory

The repeated question was not simply evidence of exhausted Groq tokens. I reproduced it on the current live site: after the bakery owner described a WordPress checkout/product-page rebuild and prior theme changes, Haven asked what they wanted to change first again. Local source also imposed canned empathy, curiosity loops and conflicting support/call instructions.

Removed the mandatory empathy anchor and several sales-first scripts. Haven now has explicit instructions to use the user's details, accept corrections, answer platform/price questions directly, give one bounded useful insight, respect hesitation and avoid endorsing insults. Budget, grammar and follower count must not substitute for an actual diagnosis. Public users still cannot obtain the paid book's chapters or exercises.

Saved routing now retains the diagnosed need, requested permission and pending action. A short Yes please after a saved call invitation continues that call rather than restarting qualification. A clearly stated implementation need is inferred from server-saved user messages, so the WordPress example does not depend entirely on a model emitting the right hidden marker. Ordinary support questions bypass old sales decisions.

Added a bounded conversation memory ledger on each saved session. The model may select short verbatim excerpts for business, audience, goal, problem, prior attempts, constraints and preferences. The server accepts only excerpts actually present in the latest user message, rejects credential/contact snippets and unsupported invented facts, records the source turn and timestamp, and commits notes with the completed reply. Later corrections can replace a fact. Notes are treated as untrusted context, never authorization or new system instructions.

This complements the recent message window and saved routing state. It is scoped to one conversation, not a global profile shared across unrelated chats. It does not promise perfect recall or preserve every detail indefinitely. The current transcript store/view remains bounded to the latest 200 messages; the provider receives at most 40 recent messages within the configured character budget. Deleting a session's server record also removes its notes. The privacy notice now explains this.

### Model and failure handling

Gemini is enabled as primary when its key is present unless explicitly disabled, including the free-tier testing you authorized. Default model: `gemini-3.8-flash`; Groq remains the fallback. Corrected Gemini configuration uses low thinking, a sufficient output allowance and the API-key header. Incomplete/truncated outputs cannot silently become a completed reply. Website Groq scoring also receives a larger output allowance and rejects unfinished output.

Each provider gets a bounded attempt rather than repeated long continuation requests. A failed response leaves the durable user turn retryable; the browser preserves its request ID and payload. Completed retries return the saved response without another model call or duplicate transcript entry. A failed image reader cannot pretend it saw the image.

The server now limits new chat requests and scoring attempts using atomic database buckets. Chat: 30 requests per browser identity per ten minutes and 100 per network bucket per hour. Scoring: five attempts per review per hour and 30 per network bucket per hour; valid cached results do not spend a new scoring attempt. Limits fail closed when their database check fails. This is useful protection, not proof against distributed abuse or rotating identities.

### Reviews, scoring and the mobile composer

Fixed the None yet path so stale website preflight state is reset and no website scorecard is displayed for that profile. A pending submission saved in session storage can survive clearing local storage; changing its critical details now requires an explicit fresh submission rather than accidentally replaying the old website payload. Existing saved-review ownership/access-recovery controls remain in place.

Reader failures now carry a specific saved reason: too little text, mostly legal/navigation text, refused reader, timeout, unusable profile, oversized extraction or unavailable scorer. The UI and prompt no longer claim video/scripts caused a failure without evidence, or turn a reader limitation into a brand clarity diagnosis. The website reader also has a one-megabyte body limit and keeps its deadline active while reading that body.

The composer hides the always-visible file-format row and counter until they are relevant, while retaining accessible guidance and validation. The existing viewport/body-lock implementation is preserved. Local checks covered a 390×420 short viewport and a 390×844 phone layout; actual iPhone Safari keyboard behaviour still needs device testing.

### Automatic moderation and notifications

The database now records distinct events atomically: first strike stays white, second becomes yellow, third becomes red. Retrying the same event does not add another strike. Obvious direct abuse has a deterministic path even when AI providers fail; nuanced cases still depend on model judgment. Genuine criticism, quoted examples and ordinary requests are explicitly distinguished from abusive conduct.

Restrictions propagate through verified linked identities. Administrators can clear a restriction or clear a recorded first strike directly without first issuing an unwanted yellow warning. Clearing a flag resets its strike count; the existing event history remains available. Unrestricted conversations continue saving new turns.

Team alerts remain addressed to **francis.teamhaven@gmail.com** and **paschal.tmh@gmail.com**. New team-inquiry alerts identify the entry point, known name where available, session and reason. Guest records do not invent an email. Existing durable outbox, safe Resend diagnostics, verified-domain sender configuration and retry/idempotency safeguards are preserved.

Anonymous restrictions identify the stored browser identity, not an infallible real-world person. A new browser or cleared identity can evade that identity-level restriction. Treat detection as reviewable, not proof that an automated accusation is correct.

### Secure Playbook access and the final shop flow

Actual charge is **₦9,639 = 963,900 kobo**, matching the visible price. The struck-through ₦15,000 remains. The Chapters 1–3 summary now says: Understand why attention does not equal sales, and choose what deserves your effort. Removed the ₦100 test-charge label and behaviour. Historical legitimate ₦100 payments made before the migration's captured cutoff remain eligible; new underpayments after that cutoff are rejected.

There is now one main Get The Unseen Playbook button on the card. The secondary recovery link beneath it is removed. Inside the modal, Buy a copy and Already purchased are separate labelled tabs with keyboard navigation and one modal close button. Recovery no longer sits below the sales preview or requires a confusing second close/back control.

A valid saved device grant opens the verified purchase view. An older receipt snapshot opens the recovery path; it does not authorize a download. On a new device, choose Already purchased and confirm the checkout inbox. Typing a known email is not sufficient proof and does not expose another buyer's purchase.

New purchases open directly after server verification; they do not ask for an OTP. Before Paystack opens, the server creates a new random reference and a private checkout proof for that reference and email. The buyer's browser retains the proof after the matching checkout callback. The server checks successful payment, amount, currency, reference and checkout email before returning any download. Preparing an unpaid checkout cannot unlock a file, and a caller cannot choose an existing buyer's reference when obtaining a checkout proof.

Recovery is for a different device, expired/revoked proof or cleared browser storage. It requires the receipt email/reference and a six-digit inbox code before issuing replacement proof. Receipt identifiers alone never authorize a download. Different review and purchase emails are allowed: a work/personal email difference is not sufficient evidence of abuse. Review deletion clears its own local review keys and preserves the independent purchase proof; manually clearing all storage requires recovery. Losing browser state before a payment callback is saved can also require recovery.

Codes are HMAC-protected in storage, expire after ten minutes, allow at most five attempts and can be redeemed once under a database lock. Requests have a one-minute resend cooldown, a three-per-hour receipt-pair cap and a network cap. A code is activated only after provider acceptance is recorded. The email contains no download grant. A temporary payment/storage outage after inbox confirmation can preserve the private device grant while withholding the download URL.

Device grants last 30 days and are stored only as hashes on the server. Checkout preparation is capped at ten per network bucket per hour. Each download click refreshes its short-lived URL and rechecks payment and returns a ten-minute signed URL from a private bucket. Old reader capabilities are rotated to version 2; new reader capabilities remain time-limited. Grants, OTPs and rate-limit tables are private to service-role operations.

Your clarified rule is implemented: **one main download action per page visit, with future recovery allowed**. A second click during that visit does not open another download. A later verified visit can open the copy again. This is an interface rule, not DRM; buyers can still save/share their PDF or forward a code.

### Emails

New purchase mail distinguishes saved-device access from inbox recovery and uses the editorial HTML layout, an Access Your Playbook button pointing to https://themarketinghaven.xyz/#shop, concise reading/application guidance and clear recovery instructions. Welcome mail now differs for website, social and None yet reviews. Existing pending template versions retain their original payload so retrying them does not create an idempotency conflict; new records default to editorial-v2.

I have **not** sent the live OTP test email. The approved inbox is francis.teamhaven@gmail.com, but the new tables/functions are not deployed and no privileged Supabase connection was available. Local tests used mocked mail/payment providers. The root sender domain's Verified status is based on your confirmation, not a new account inspection.

### Admin Dashboard: agency operations

Team Inquiries is now its own sixth tab, separate from Support Chats and Service Chats. It has a dedicated backend query/cap so support traffic cannot crowd inquiries out of the same 500-record result window. Linked conversations still remain visible under their lead's transcript subtabs.

Each inquiry supports New, Reviewing, Contacted, Booked, Closed and Lost status; an assigned team member; a Lagos follow-up date; and internal next-action notes. Search covers names, IDs, owners and notes. Status, due-date and access-flag filters help triage. These edits do not send a message to a visitor or create a Calendly booking.

Workflow saves use a revision check under a row lock. Two administrators cannot silently overwrite one another: a stale save returns a conflict, preserves the draft and offers an explicit reload of the newer saved details. Workflow edits cannot overwrite the chat transcript or access flag.

Added work-queue cards for open/unassigned/due inquiries, hot leads awaiting follow-up, pending review/purchase mail and calls in the next seven days. Counts clearly describe loaded records. Added a private operational snapshot for the last 24 hours of completed Gemini/Groq replies, failed/stalled turns and queued flag events. These are **not** token usage, billing, inbox-delivery confirmation or lifetime CRM totals.

Added filtered inquiry CSV export and formula-safe escaping for both inquiry and lead exports. Spreadsheet quoting alone did not prevent a malicious user-entered cell from being treated as a formula.

The workflow design was informed by the practical use of stages in [HubSpot's official pipeline documentation](https://knowledge.hubspot.com/object-settings/set-up-and-customize-pipelines?content_language=English). No HubSpot integration, account connection or external synchronization was added.

### Final presentation check

Kept the existing site structure, hero copy, service cards, story/video controls and testimonial slots. No animation library or new decorative animation was introduced. The assembled page, navigation anchors, mobile menu, price and phone-width overflow were checked locally.

The testimonial background retains its natural green/gold colour, with the whitening, brightness and saturation treatment removed and only a restrained readability overlay. Those warm colours provide an accent to the zinc/black palette. An original TMH/client image could eventually give this area more distinctive meaning than an abstract texture, but another redesign is not needed to test the product.

## Validation and what the evidence means

Final command output is in [the validation log](C:/Projects/tmh-platform/PRODUCTION_RELIABILITY_20261026_VALIDATION.txt). It includes the full test run, your exact three-file command, PostgreSQL checks, Deno checks, build, lint diagnostics, `git diff --stat` and `git status`.

Final results on this branch:

| Check | Result |
| --- | --- |
| Full local test suite | 312 passed, 0 failed |
| Requested three-file test command | 27 passed, 0 failed |
| Isolated SQL migration/security checks | 21 passed, 0 failed |
| Deno checks | All 14 affected function bundles passed |
| Production build | Passed; main JS 837.28 kB / 246.24 kB gzip |
| Lint | Fails: 51 errors, 2 warnings; baseline was 52 errors, 2 warnings |
| Git whitespace check | Passed; Git emits Windows LF/CRLF conversion notices |
| Private chapter/memory strings in client bundle | No matches |

The new root deno.lock records remote dependency hashes from the local Deno checks. It is included in the changed-file inventory; deployment must still use the intended dependency resolution.

The lint failures remain a repository maintenance item; this is not a green lint result. The full original diagnostics are in the validation log. The production build also warns about the main chunk exceeding 500 kB. Additional splitting can be planned after the core flows are tested.

The deterministic tests cover access boundaries, durable retries, moderation, memory evidence/corrections, price/payment validation, OTP limits/replay, linked transcripts, inquiry conflict handling and exports. The SQL checks ran on an isolated PostgreSQL-compatible PGlite runtime, not on your production Supabase project. Browser fixtures used real components with mocked services and sample records; temporary fixtures and servers were removed afterward.

Live public QA confirmed the existing repeated-question problem. It did not verify the new Gemini configuration, OTP delivery, private Admin records, production migrations, actual payment completion or real iPhone keyboard behaviour. No credentials or inbox codes were guessed, and no CAPTCHA was bypassed.

The most important next test is the full real path: **review → coherent saved discussion → correct next step**, and separately **approved payment → direct private download without OTP → later inbox-verified recovery**. Unit tests cannot establish whether a model's advice is perceptive or pleasant.

Browser evidence from local QA (synthetic records and mocked providers):

- [Playbook recovery tabs](C:/Users/HP/.codex/visualizations/2026/10/15/01a14147-e2a1-79f0-a9b1-a40129dc70f0/tmh-production-qa-20261026/playbook-recovery-tabs-mobile.png)
- [Direct purchase download view](C:/Users/HP/.codex/visualizations/2026/10/15/01a14147-e2a1-79f0-a9b1-a40129dc70f0/tmh-production-qa-20261026/playbook-direct-purchase-mobile.png)
- [Agency workspace overview](C:/Users/HP/.codex/visualizations/2026/10/15/01a14147-e2a1-79f0-a9b1-a40129dc70f0/tmh-production-qa-20261026/admin-agency-workspace.png)
- [Natural testimonial colour in light mode](C:/Users/HP/.codex/visualizations/2026/10/15/01a14147-e2a1-79f0-a9b1-a40129dc70f0/tmh-production-qa-20261026/testimonial-natural-colour-light.png)

## Deployment handoff — not executed

1. Review the branch and confirm the project's migration history through the October 25 email-template and booking migrations. Use a coordinated checkout maintenance/release window so an old cached ₦100 checkout cannot create a new payment after the legacy cutoff.
2. Apply [20261026000000_playbook_recovery.sql](C:/Projects/tmh-platform/supabase/migrations/20261026000000_playbook_recovery.sql), then [20261026000001_haven_reliability.sql](C:/Projects/tmh-platform/supabase/migrations/20261026000001_haven_reliability.sql), once through the normal migration process. They contain the OTP/checkout-grant security, cutoff, strike policy, reason fields, memory, inquiry workflow and operational statistics changes. Neither was run live.
3. Verify secrets without pasting them into chat: GEMINI_API_KEY; GEMINI_MODEL=gemini-3.8-flash; GEMINI_ENABLED=true; GROQ_API_KEY and optional GROQ_MODEL; PAYSTACK_SECRET_KEY for the same live account as checkout; RESEND_API_KEY; RESEND_FROM_EMAIL on the verified root domain; ADMIN_PASSWORD. Supabase's URL/service-role environment must be available to functions. The previous GEMINI_BILLING_CONFIRMED switch no longer disables the explicitly authorized free-tier test.
4. Deploy the fourteen affected bundles listed below to project dkpoygkduktusrnsbpaq. flag-user requires redeployment because its shared moderation dependency changed, even though its entry file did not. Keep all internal email functions protected by their existing internal service authentication; the two public OTP endpoints rely on their own bounded validation, payment checks, codes and rate limits.
5. Deploy the frontend only when you choose to publish it. Coordinate it with the updated backend and privacy notice version 2026-10-26; older clients will be asked to refresh. Clear the relevant CDN/service-worker cache if applicable. No frontend was published here.
6. Confirm the existing Paystack charge.success webhook still targets the paystack-webhook function and verifies the correct account secret. Confirm the bucket playbook-private remains private and contains The_Unseen_Playbook.pdf. Check Calendly's existing poll/booking synchronization rather than assuming a manual inquiry status creates a booking.
7. Configure a private daily maintenance job to invoke cleanup_playbook_security with a genuine service-role context. A bare pg_cron call without the required role/claim will fail its guard. Do not expose a public cleanup endpoint. The function removes old codes, expired grants (including unused checkout proofs) and stale rate buckets; no job was installed.
8. Send the approved recovery test to francis.teamhaven@gmail.com after deployment. Check both flag-alert inboxes, acceptance vs delivery, code expiry/replay and an approved real checkout. Then run the three-owner plan before broad marketing.

Function bundles: haven-chat; scrape-website; score-social; create-brand-review; verify-paystack; request-playbook-recovery (new); verify-playbook-recovery (new); paystack-webhook; send-purchase-thankyou; send-welcome-email; send-flag-alert; flag-user (shared dependency); admin-fetch-leads; admin-update-lead.

## Honest model recommendation

Gemini 3.8 Flash is a reasonable budget-conscious starting point for Haven; it is not proven to be the best option for these conversations. Google documents the stable model and low/medium/high thinking support; minimal is unsupported. Paid access changes account limits and data terms rather than turning an otherwise identical model into a different personality. [Official model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash).

Budget for the intended launch date. Google's current Standard pricing is $0.75/M input and $3.75/M output through December 31, 2026, then $1.50/M and $7.50/M from January 1, 2027. Output includes thinking tokens. An illustrative 10,000-input/500-output turn at the latter prices costs about $0.01875 before other services, retries or caching; this is not a measured Haven average. Free-tier content may be used for product improvement; paid Standard has different data terms. [Official pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash).

The largest quality gains here come from coherent instructions, grounded context, reliable state and evaluation. Paying for a model cannot repair forgotten permissions or an incorrect recovery flow. Use the three owners' actual conversations to judge the experience, and compare another model only on the same cases if Flash remains weak.

## Remaining launch priorities

- **Before a public launch:** move the private admin workspace from a shared browser-stored password to individual authenticated staff accounts, administrator-controlled roles and MFA. The current password gate remains; assigning an inquiry owner is a work label, not an access-control grant or an audited staff identity. Keep privileged credentials private and the admin workflow under controlled use.
- **Before scaling:** verify which client-IP header your deployed proxy overwrites/trusts; do not assume a supplied header is spoof-proof. Add deployment-level abuse protection and monitor real rate-limit failures, model quotas, latency and spending. Current browser-identity limits can be bypassed by identity rotation; network/shared-office limits can also affect legitimate users.
- **Operational readiness:** schedule private cleanup and reliable outbox retries; monitor email bounces, failed turns, webhook/poll failures and private-download errors. The dashboard aggregates some existing records but does not contain complete provider traces, token accounting or incident alerts.
- **Commercial readiness:** test refunds/chargebacks and a deliberate grant-revocation procedure. Current success verification is not a complete refund/entitlement-management system. Review long-term retention, backups and deletion handling with the real service configuration.
- **Scale and maintenance:** loaded CRM lists remain capped at 500 per scope and linked indexes at 5,000. Add server pagination/global reporting when volume requires it. Existing lint debt and the large main frontend bundle remain; avoid claiming that the build warning or an automated test certifies real mobile performance.
- **Content and trust:** add the remaining genuine video/testimonial/team assets when ready, keep pending material clearly labelled, and avoid marketing promises that imply an infallible strategist or guaranteed sales. The strongest differentiator will be useful, trustworthy outcomes, not the claim of being the first agency with AI.

Use [the three-owner beta plan](C:/Projects/tmh-platform/HAVEN_BRAND_OWNER_BETA_TEST_PLAN_20261026.md) for the next phase. It includes memory, criticism, natural language, website/social/None paths, purchase access, moderation, admin handling and real iPhone checks.

## Exact changed-file inventory

The inventory below includes tracked modifications and new files; ordinary git diff --stat omits untracked files until they are staged.

All 64 tracked modifications and new files at handoff (ignored build/cache files and screenshots outside the repository are excluded):

- [HAVEN_BRAND_OWNER_BETA_TEST_PLAN_20261026.md](C:/Projects/tmh-platform/HAVEN_BRAND_OWNER_BETA_TEST_PLAN_20261026.md)
- [PRODUCTION_RELIABILITY_20261026_REPORT.md](C:/Projects/tmh-platform/PRODUCTION_RELIABILITY_20261026_REPORT.md)
- [PRODUCTION_RELIABILITY_20261026_VALIDATION.txt](C:/Projects/tmh-platform/PRODUCTION_RELIABILITY_20261026_VALIDATION.txt)
- [deno.lock](C:/Projects/tmh-platform/deno.lock)
- [scripts/check-final-migrations.mjs](C:/Projects/tmh-platform/scripts/check-final-migrations.mjs)
- [src/App.jsx](C:/Projects/tmh-platform/src/App.jsx)
- [src/components/ShopSection.jsx](C:/Projects/tmh-platform/src/components/ShopSection.jsx)
- [src/components/TestimonialsSection.jsx](C:/Projects/tmh-platform/src/components/TestimonialsSection.jsx)
- [src/components/admin/InquiryWorkflow.jsx](C:/Projects/tmh-platform/src/components/admin/InquiryWorkflow.jsx)
- [src/components/haven/components/HavenDrawer.jsx](C:/Projects/tmh-platform/src/components/haven/components/HavenDrawer.jsx)
- [src/components/haven/components/HavenScoreCard.jsx](C:/Projects/tmh-platform/src/components/haven/components/HavenScoreCard.jsx)
- [src/components/haven/components/chat/ChatInput.jsx](C:/Projects/tmh-platform/src/components/haven/components/chat/ChatInput.jsx)
- [src/components/haven/context/HavenContext.jsx](C:/Projects/tmh-platform/src/components/haven/context/HavenContext.jsx)
- [src/components/modals/BrandReviewModal.jsx](C:/Projects/tmh-platform/src/components/modals/BrandReviewModal.jsx)
- [src/lib/adminWorkspace.js](C:/Projects/tmh-platform/src/lib/adminWorkspace.js)
- [src/lib/brandReviewService.js](C:/Projects/tmh-platform/src/lib/brandReviewService.js)
- [src/lib/havenIdentity.js](C:/Projects/tmh-platform/src/lib/havenIdentity.js)
- [src/pages/AdminDashboard.jsx](C:/Projects/tmh-platform/src/pages/AdminDashboard.jsx)
- [src/pages/PrivacyPage.jsx](C:/Projects/tmh-platform/src/pages/PrivacyPage.jsx)
- [src/pages/TermsPage.jsx](C:/Projects/tmh-platform/src/pages/TermsPage.jsx)
- [supabase/config.toml](C:/Projects/tmh-platform/supabase/config.toml)
- [supabase/functions/_shared/email-template.js](C:/Projects/tmh-platform/supabase/functions/_shared/email-template.js)
- [supabase/functions/_shared/haven-conversation.ts](C:/Projects/tmh-platform/supabase/functions/_shared/haven-conversation.ts)
- [supabase/functions/_shared/haven-limits.ts](C:/Projects/tmh-platform/supabase/functions/_shared/haven-limits.ts)
- [supabase/functions/_shared/haven-memory.js](C:/Projects/tmh-platform/supabase/functions/_shared/haven-memory.js)
- [supabase/functions/_shared/haven-model.ts](C:/Projects/tmh-platform/supabase/functions/_shared/haven-model.ts)
- [supabase/functions/_shared/haven-moderation.ts](C:/Projects/tmh-platform/supabase/functions/_shared/haven-moderation.ts)
- [supabase/functions/_shared/haven-prompts.js](C:/Projects/tmh-platform/supabase/functions/_shared/haven-prompts.js)
- [supabase/functions/_shared/haven-routing.js](C:/Projects/tmh-platform/supabase/functions/_shared/haven-routing.js)
- [supabase/functions/_shared/haven-scoring.ts](C:/Projects/tmh-platform/supabase/functions/_shared/haven-scoring.ts)
- [supabase/functions/_shared/playbook-access.js](C:/Projects/tmh-platform/supabase/functions/_shared/playbook-access.js)
- [supabase/functions/_shared/playbook-recovery.ts](C:/Projects/tmh-platform/supabase/functions/_shared/playbook-recovery.ts)
- [supabase/functions/_shared/scoring-copy.js](C:/Projects/tmh-platform/supabase/functions/_shared/scoring-copy.js)
- [supabase/functions/admin-fetch-leads/index.ts](C:/Projects/tmh-platform/supabase/functions/admin-fetch-leads/index.ts)
- [supabase/functions/admin-update-lead/index.ts](C:/Projects/tmh-platform/supabase/functions/admin-update-lead/index.ts)
- [supabase/functions/create-brand-review/index.ts](C:/Projects/tmh-platform/supabase/functions/create-brand-review/index.ts)
- [supabase/functions/haven-chat/index.ts](C:/Projects/tmh-platform/supabase/functions/haven-chat/index.ts)
- [supabase/functions/paystack-webhook/index.ts](C:/Projects/tmh-platform/supabase/functions/paystack-webhook/index.ts)
- [supabase/functions/request-playbook-recovery/index.ts](C:/Projects/tmh-platform/supabase/functions/request-playbook-recovery/index.ts)
- [supabase/functions/score-social/index.ts](C:/Projects/tmh-platform/supabase/functions/score-social/index.ts)
- [supabase/functions/scrape-website/index.ts](C:/Projects/tmh-platform/supabase/functions/scrape-website/index.ts)
- [supabase/functions/send-flag-alert/index.ts](C:/Projects/tmh-platform/supabase/functions/send-flag-alert/index.ts)
- [supabase/functions/send-purchase-thankyou/index.ts](C:/Projects/tmh-platform/supabase/functions/send-purchase-thankyou/index.ts)
- [supabase/functions/send-welcome-email/index.ts](C:/Projects/tmh-platform/supabase/functions/send-welcome-email/index.ts)
- [supabase/functions/verify-paystack/index.ts](C:/Projects/tmh-platform/supabase/functions/verify-paystack/index.ts)
- [supabase/functions/verify-playbook-recovery/index.ts](C:/Projects/tmh-platform/supabase/functions/verify-playbook-recovery/index.ts)
- [supabase/migrations/20261026000000_playbook_recovery.sql](C:/Projects/tmh-platform/supabase/migrations/20261026000000_playbook_recovery.sql)
- [supabase/migrations/20261026000001_haven_reliability.sql](C:/Projects/tmh-platform/supabase/migrations/20261026000001_haven_reliability.sql)
- [tests/admin-flags-ui.test.mjs](C:/Projects/tmh-platform/tests/admin-flags-ui.test.mjs)
- [tests/admin-management.test.mjs](C:/Projects/tmh-platform/tests/admin-management.test.mjs)
- [tests/admin-tabs.test.mjs](C:/Projects/tmh-platform/tests/admin-tabs.test.mjs)
- [tests/admin-workspace.test.mjs](C:/Projects/tmh-platform/tests/admin-workspace.test.mjs)
- [tests/backend-tasks.test.mjs](C:/Projects/tmh-platform/tests/backend-tasks.test.mjs)
- [tests/haven-flags-scraper.test.mjs](C:/Projects/tmh-platform/tests/haven-flags-scraper.test.mjs)
- [tests/haven-scorecard.test.mjs](C:/Projects/tmh-platform/tests/haven-scorecard.test.mjs)
- [tests/haven-server.test.mjs](C:/Projects/tmh-platform/tests/haven-server.test.mjs)
- [tests/legal-disclosures.test.mjs](C:/Projects/tmh-platform/tests/legal-disclosures.test.mjs)
- [tests/paystack-purchases.test.mjs](C:/Projects/tmh-platform/tests/paystack-purchases.test.mjs)
- [tests/playbook-guidance.test.mjs](C:/Projects/tmh-platform/tests/playbook-guidance.test.mjs)
- [tests/playbook-recovery.test.mjs](C:/Projects/tmh-platform/tests/playbook-recovery.test.mjs)
- [tests/playbook-ui.test.mjs](C:/Projects/tmh-platform/tests/playbook-ui.test.mjs)
- [tests/review-save-ui.test.mjs](C:/Projects/tmh-platform/tests/review-save-ui.test.mjs)
- [tests/review-security.test.mjs](C:/Projects/tmh-platform/tests/review-security.test.mjs)
- [tests/user-flags.test.mjs](C:/Projects/tmh-platform/tests/user-flags.test.mjs)

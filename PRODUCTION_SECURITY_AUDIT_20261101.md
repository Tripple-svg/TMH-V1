# TMH completion and security report · 1 November 2026

> Historical report. See [the final launch-lock report](FINAL_LAUNCH_LOCK_REPORT.md) for the current branch, function inventory, migration-drift caution and latest live findings.

The implementation is prepared on **`codex/support-recovery-and-production-audit`**, compared with **`641843bb466c5bdbb677afbe66cc9708b171bc36`**. Changes are local and uncommitted. This pass did not push, deploy, change provider accounts, enroll an authenticator, send real email, make a payment or create an appointment.

The work addresses the requested security, support, admin, privacy and usability gaps. The release must be deployed and pass the live acceptance checks below before it is described as production-ready. Local tests cannot establish the current state of provider dashboards or certify that a system is unhackable.

Read the [deployment runbook](DEPLOYMENT_RUNBOOK_20261101.md) for the exact 10 migrations, 26 function names, configuration checks, schedules and rollback instructions. Read [privacy operations](PRIVACY_OPERATIONS_20261101.md) for the rights matrix, retention choices, preliminary risk assessment and human responsibilities.

## Support requests: what happens now

**Yes: submitted issues appear in Admin → Support Requests, and notifications are queued to both `francis.teamhaven@gmail.com` and `paschal.tmh@gmail.com`.**

The public `/support` page gives three steps: choose the issue, describe it with a contact email, then complete consent/security and send. Successful submission returns a saved reference. Issue cards replace the basic dropdown; zinc glass panels, clear labels, keyboard semantics, pending states and preserved drafts make the form easier to use. There is an email fallback when submission fails.

The request is stored before notification delivery. A separate worker claims queued requests and sends both team inboxes a safely escaped summary linking staff back to Admin. The private message stays in the dashboard. Provider failures remain pending for retry. Resend acceptance and actual inbox delivery are different states; a support reference does not claim that an email arrived. Stable idempotency keys, leases and a bounded retry window reduce duplicate sends. An uncertain request past that window requires investigation rather than a blind resend.

Admin provides status, private notes, a reason for changes, revision conflict handling and action history. Refresh does not silently overwrite a conflicting draft. Staff can reply through their mail client; the product does not claim to have sent a reply merely because a mail link opened. Counts describe the loaded queue and its total; the latest 100 requests are fetched.

Review lockouts no longer leave the visitor without a support path. Support has its own small submission budget and CAPTCHA, separate from review limits. Staff can clear the affected request's review/email-lookup network budgets, or the saved-device verification lock when a browser capability was actually verified. Actions are audited. A reset grants another attempt; it does not restore private ownership, remove behavioral restrictions, clear unrelated OTP/network budgets or grant a paid download. Shared-network effects are disclosed to staff.

**Plain mail to `info@themarketinghaven.xyz` is not automatically a form submission.** An optional signed Zoho webhook is now implemented to create metadata-only support entries from incoming mail. It validates raw-body HMAC, pins the integration secret through a protected first enrollment, deduplicates events and marks the source as Zoho. It does not import bodies/attachments, prove the sender owns a review, synchronize the whole inbox or send replies. Activate it using [Zoho setup](supabase/manual/ZOHO_SUPPORT_SETUP.md); it requires the owner's live Zoho configuration. Remove the one-time enrollment secret afterward.

## Security fixes and adversarial verification

Testing was bounded to this owned project: local handlers and isolated PostgreSQL schemas, plus seven invalid-input live requests. There was no load attack, credential guessing, production record deletion or attempt to read another customer's data.

| Risk / attack case | Implemented control and verification |
| --- | --- |
| Removed/demoted admins retaining access through stale JWT claims | Edge verifies the bearer with Auth, then calls a service-only database gate that reads current role, ban, deletion and verified factors. RLS uses current Auth rows too. A stale public Auth response cannot override the database. Missing guard schema fails closed. |
| Password-only access after an admin enables MFA | Dashboard authenticator enrollment/challenge/removal, fresh factor checks and AAL2 enforcement for enrolled staff in Edge and RLS. An existing AAL1 token is rejected after enrollment. Unenrolled staff retain access until they deliberately enroll. Password recovery does not remove MFA. |
| Password reset / invite confusion and account takeover through editable metadata | Account-neutral forgot-password flow, safe expired/used-link handling, verified server roles and explicit current-password verification for authenticated changes. Cosmetic URL markers cannot substitute for a real recovery callback. Public and admin sessions are separated. |
| Unattributed private mutations or disputes between admins | Transactional mutation + append-only audit records verified actor, action, target, changed field names, time, outcome and keyed network identifier. Direct runtime/browser audit writes are denied. Database ownership remains privileged. History begins when this release is installed. |
| Unauthorized private API access, forged role fields and IDOR | Tests reject anonymous/public/service-key impersonation, editable `user_metadata`, cross-review and cross-visitor credentials, invented IDs and invalid private briefing capabilities. An email or UUID alone grants no review/download access. |
| AI spending abuse despite short-term request limits | Atomic server-side daily call/token reservations for visitor, review, network and global scopes. Reservation precedes primary retries and fallback; actual usage settles the charge. Unknown attempts remain conservatively charged. Admin pause controls work without redeployment. |
| Prompt injection / model-invented permissions | Browser system prompts and invalid role history are rejected; saved server history and ownership govern decisions. Scraped text and screenshots remain untrusted evidence. Model tags cannot authorize private operations. Output renders as text with controlled application actions. |
| Oversized or disguised screenshots | Canonical base64, MIME/file structure, decoded bytes, dimensions and pixel limits before Storage/vision. PNG, JPEG and WebP accepted; renamed HTML/SVG, truncation and impossible dimensions rejected. Stored screenshots are checked again. This is structural validation, not a claim of malware scanning or full pixel decoding. |
| Unbounded webhook allocation or tampered Paystack payloads | Bounded streamed raw body, HMAC verification before JSON parsing and existing reference/idempotency/recipient checks. Tests cover whitespace/UTF-8 signatures, tampering and replay behavior. |
| Deletion by email-link scanners or accidental page opening | Opening the confirmation page no longer deletes on mount. Explicit confirmation is required. Database deletion snapshots screenshot paths transactionally; failed Storage cleanup remains durable and retryable. Separate purchases are preserved. |
| Untrusted first Zoho event / duplicate incoming-mail events | Enrollment token plus valid HMAC are required before pinning the secret; later events must match it. Incoming source metadata is not identity proof. Invalid or repeated events cannot create arbitrary authenticated access. |
| Cross-origin abuse and broad browser connection policy | Exact canonical/www origins and explicit local development ports; no arbitrary subdomain wildcard. CSP narrows Supabase connections/media to this project. Existing HSTS, frame denial and no-sniff headers remain. CORS is browser policy, not a substitute for authorization. |
| Dependency and build-chain exposure | Updated pinned dependencies and build tools, committed-lockfile CI, full dependency audit, pinned workflow action revisions and weekly Dependabot checks. Full and production audits returned zero known vulnerabilities at verification time. |

Paystack documents raw-payload HMAC and retries that can continue for 72 hours. Its documented event signature does not provide a separate signed freshness header. Adding an invented short timestamp cutoff could reject legitimate delayed payments. IP enforcement belongs at a trusted gateway that overwrites forwarding headers; this pass does not claim a spoofable client IP header is an allowlist. [Paystack webhook documentation](https://paystack.com/docs/payments/webhooks/)

The project service key remains a privileged server credential. The public entrypoints and audited RPCs limit what callers can request; they do not make a stolen service key harmless. Keep it out of browser variables, logs, Git and cron literals, and rotate it privately if exposed. Provider billing budgets and account security remain necessary alongside application controls.

## AI reliability, knowledge and conversation behavior

Haven now explains the support form/reference workflow, the limits of support resets, staff password/authenticator recovery, daily allowances/temporary pauses, consented activity, explicit data deletion and the inline About player. Operational help works in all chat scopes. Factual FAQ handling is deterministic where appropriate, so these answers do not require a paid model call.

The routing cross-check found and fixed an important interaction: an operational question could otherwise be overridden by an earlier booking invitation or service delegation. The new help detours preserve saved marketing evidence and pending permission; answering a support question does not erase an agreed next step. Applying a purchased book stays conversational guidance rather than being mistaken for a broken-download ticket.

Retry/thinking UI is now confined to the actual chat view. It no longer leaks into the scorecard when the user changes views. The failed turn remains available when they return to chat. Existing private ownership, saved-turn replay, cancellation, bounded history, moderation escalation and source-correction behavior are covered by the regression suite.

Gemini/Groq timeouts, a short transient retry and configured fallback remain. A `503` indicates provider unavailability; it is not proof of lifetime token exhaustion. No local change can guarantee an upstream model is available. The live stop/continue trial in this pass released the composer correctly but the continued request reached the saved-message retry error. A successful live model continuation therefore remains an acceptance requirement after deployment/configuration; it is not reported as proven here.

Atomic AI admission does not shorten the existing allowed chat history, screenshot size or response limits. Tests include a full 5 MiB image and 40 normal text turns fitting default ceilings. Conservative token ceilings admit worst-case image payloads; actual counters settle actual reported usage. Default daily provider-call limits are 120 per visitor, 120 per review, 600 per network and 2,000 globally. Tune these in Admin → Security & AI against actual provider pricing. They are not an exact naira spend guarantee. Existing usage/provider-error alerts are separate scheduled work.

Haven does not autonomously retrain itself. Improve prompts through reviewed real-world examples and evaluation, without blindly treating customer statements or model suggestions as new policy. No custom model or fine-tuning pipeline was added.

## Admin workspace and operational clarity

The workspace retains Leads, Purchases, Bookings, Support Chats, Services and Team Inquiries, and adds Support Requests plus Security & AI. Existing unified transcripts, flag/temperature context, booking ownership and delivery status stay available. New controls show aggregate visitor activity, durable support delivery, security audit history, AI admission settings and authenticator setup. The current admin interface is not a general Zoho mail client or a full CRM.

Staff assignment continues to use private expiring briefing links and separate explicit send actions. Existing assignment tests cover revision fencing, immutable delivery retries, revocation, per-invitee booking confirmation and denial of direct browser access. The changes do not grant teammates access to the complete admin workspace merely because they receive a briefing.

Activity is described honestly: one panel counts saved Haven browser identities and recent user turns; a separate optional-consent panel estimates retained site browser profiles and activity within five minutes. These are not unique people, all visitors or an exact instantaneous online count. Multiple devices, cleared storage and bots affect the estimates. Optional presence sends no email, page history, fingerprint or raw IP.

## Website polish without restructuring

- Support replaces the basic selector with accessible issue cards, three visible steps, saved-reference expectations and clearer security copy.
- Header navigation now puts Class before Playbook on desktop and mobile, matching section order.
- About copy explains the concrete sequence: visible evidence, proportionate next step and scoped human execution. No invented client results or guaranteed revenue were added.
- Shop copy explains immediate PDF access after verified payment. The actual charge remains **₦9,639 / 963,900 kobo**, and the optional follow-up remains unchecked and separate from buying.
- About video metadata/duration/seek updates now handle loading, progress and seeking events correctly, reject invalid duration values and retain inline playback. The supplied test clip is about 25.23 seconds. No scroll-controlled video or popup was introduced.
- Service cards gain a restrained zinc glow, small lift and arrow motion on fine-pointer hover. The Playbook cover has a subtle hover perspective. Reduced-motion preferences remove movement; keyboard focus remains visible. No new animation library or idle animation loop was added.
- Contact/help actions are available around review submission, missing access, restrictions, payment recovery, deletion and the footer. The existing public email, WhatsApp number and Lagos location remain.
- Pending real testimonials, portraits and videos were not replaced with fabricated assets.

## Privacy and retention actually implemented

Cookie choices now carry a version and timestamp. Optional analytics stays off until a current server receipt is acknowledged. Undated/expired affirmative preferences ask again; rejection remains off. A 13-calendar-month reconfirmation period is the chosen product policy, not a claim that every consent has that statutory expiry.

Server-owned cookie receipts replace direct anonymous table insertion. Consented presence stops on withdrawal, hidden/offline state or storage failure. It deduplicates browser tabs and limits heartbeat frequency.

Daily maintenance clears inactive chat text, compact memory and routing evidence after 180 days while preserving minimal private-access/session metadata. Consent receipts expire after two years; inactive optional presence profiles after 13 months. Resolved support requests and their operational history expire after 90 days. These periods require the scheduled jobs to be activated. Separate purchases and saved-review ownership are not silently erased.

The revised privacy/terms text distinguishes review deletion from deleting every record, and explains providers, support review, automated flags and human appeal. The operations document distinguishes working product flows from human access, rectification, portability, objection and complaint handling. It also identifies provider-contract/transfer checks and incident response responsibilities. No legal certification or completed regulator filing is claimed. [NDPC's NDPA publication](https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf)

## Verification results

Final verification is complete. Logs are local under `node_modules/.cache`; they are not production monitoring or deployment evidence.

| Check | Result |
| --- | --- |
| Complete Node regression suite | **556 passed, 0 failed**, no skipped/cancelled tests; exit 0. |
| Requested backend / booking / Playbook subset | 29 passed, 0 failed. |
| Corrected MFA + actual migration-chain SQL tests | 8 passed, 0 failed, including integration subtests. |
| Screenshot validation after TypeScript fix | 4 passed, 0 failed. |
| Affected Edge Functions | Deno check passed for all 26 entrypoints. |
| ESLint | Exit 0, zero errors and warnings. |
| Full npm audit / production npm audit | Both exit 0, zero known vulnerabilities. |
| Production build | Exit 0 on Node 24 / Vite 8.3.5; one large-chunk advisory. |
| Git whitespace/error check | `git diff --check` passed. |
| Live bounded negative HTTP smoke | 7 passed, 0 failed. |

The initial final-suite attempt found two SQL quoting failures (548/550 passed; six nested integration cases could not run until the parent migration loaded). The missing dollar delimiters in the new guard/fixture were corrected; dedicated PostgreSQL tests then passed. Deno also exposed strict-narrowing/closure type errors in screenshot validation and website scoring; those were corrected without weakening validation, and the 26-entrypoint type check passed. These failures were fixed rather than omitted from the results.

The live negative smoke used public configuration only. It verified: anonymous admin denial, JSON role spoof denial, foreign-origin Haven denial, browser system-prompt rejection, forged Paystack signature denial, invalid team capability denial and non-POST deletion rejection. The script is `scripts/security-smoke.mjs` and is intentionally not a penetration/load scanner.

Earlier browser inspection confirmed live security headers, the public price and absence of horizontal overflow at the effective 1280px viewport. The last local browser connection then timed out while focusing/rendering the rebuilt app, so a fresh visual sign-off is not claimed. The attempted mobile viewport override did not produce a real mobile viewport. Real iPhone Safari keyboard/composer behavior, final mobile visuals and physical-device playback remain manual acceptance checks. UI component tests do not simulate the iOS keyboard.

## Deploy and verify: finite owner checklist

1. Preserve the current good Netlify deploy and record backend versions. Back up the database and private Storage separately. Use Node 24 and this lockfile.
2. Follow the runbook's dry-run/history checks and apply the **10 pending migrations before the 26 Edge Functions**. Missing the new admin gate fails private requests closed with 503; it must be installed first.
3. Verify the private provider configuration, CAPTCHA and Auth custom SMTP/callbacks. Edge `RESEND_API_KEY` does not configure Supabase Auth mail. Enroll the two approved admins in the new authenticator UI and rehearse recovery with the owner.
4. Set the internal worker secret and its matching Vault entry, then activate support, privacy, API-alert and intended existing follow-up jobs. Inspect actual scheduled executions and HTTP results. Activate the optional Zoho webhook only through its private setup procedure.
5. Publish the reviewed frontend. Verify `/support`, `/admin`, invite/reset callbacks and legal/deletion deep links under production CSP.
6. Submit one controlled support issue and confirm the dashboard reference, one alert in **each** team inbox, status/note update, audit entry and a scoped reset that does not grant someone else's access. Use `francis.teamhaven@gmail.com` for approved customer QA mail.
7. Check the successful model, payment/recovery and Calendly paths below. These require real configured services; no local mock is evidence that an inbox, appointment or payment succeeded.

**Calendly answer:** both signed webhook and polling implementations exist. This release repairs the five-minute poller to read its internal secret from Vault, and removes the placeholder job. It intentionally leaves polling unscheduled when the Vault secret is absent/too short. The live subscription/job state was not accessible in this pass; the runbook supplies read-only checks. A migrated file alone does not prove polling is running, and a successful SQL cron run does not prove the queued HTTP request succeeded.

**Rollback answer:** Netlify can republish a previous complete deploy. That does not roll back functions, database, Auth, cron or provider configuration. Use the runbook's recorded backend versions and forward corrective migrations; do not drop support/audit/purchase tables to hide a bad deployment. Supabase database backups do not include the actual Storage objects, so preserve those separately. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups), [Netlify deploy management](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/)

## Beta acceptance with three brand owners

Use one website owner, one social/WhatsApp seller with a screenshot and one owner choosing None. Ask them to speak naturally rather than follow only prepared prompts.

- Can each explain what TMH offers and what their next step is without help? Ask what they expected before each click.
- Does a review distinguish visible evidence, unsupported claims and insufficient evidence? Correct a wrong URL/screenshot without losing private access or fabricating a fresh identity. None must go to conversation rather than fake scoring.
- Does Haven remember their audience/problem, accept corrections, answer an operational question mid-discussion and resume the useful next step? Accept and decline both Playbook/call invitations. Stop, continue and retry once under a controlled failure.
- Does Support resolve access/download questions before selling, offer a tracked human path and avoid instructing them to clear private saved access? Verify a support request appears in Admin and both inboxes.
- Verify an approved fresh checkout grants direct download without OTP; another-device recovery requires email/reference plus the emailed code. Incorrect/expired/replayed codes fail. One download action per visit does not remove a buyer's future recovery rights.
- Test source-tracked booking from Services and Haven, reject a duplicate active booking where expected, and reconcile cancellation without inventing an appointment. Observe both the provider and Admin.
- Test the iPhone keyboard open/close, drawer scrolling, light/dark contrast, touch navigation and About seek slider on physical devices. Do not infer Safari behavior from desktop screenshots.
- Staff rehearse a lost password, expired link, MFA sign-in, old-token denial after enrollment/role change, safe support reset and audit review using approved reversible test accounts/records.

Record expected result, actual result, device, reference and redacted error code. Do not record passwords, OTPs, access links or full private transcripts in the shared test sheet. Have the testers describe what was confusing; a green technical test is not proof that the offer is understandable or valuable.

## Assessment and remaining boundaries

My current judgment is **7/10 for a controlled beta**, pending the listed live acceptance evidence. This is a product/readiness judgment, not a measured security certification. The interface and operational foundations are considerably stronger; sustained model quality, delivered mail, provider availability, real-device behavior and actual customer outcomes still need observation. A useful agency platform earns trust through accurate advice and reliable follow-through, not by calling itself enterprise-grade.

This closes the implementation gaps found within this pass. It does not turn unchecked external setup into a completed task. The owner still controls deployment, provider billing/models, Auth SMTP, Zoho enrollment, schedules, legal operating decisions and physical-device acceptance. No additional feature expansion is required to perform those checks. A waitlist, client onboarding product, paid speech service and a subscription app remain separate future work; they were not silently added to this release.

## Final release evidence and complete changed-file inventory

The final test summary and Git inventory are appended here by the completion pass. Tracked Git diff statistics exclude new untracked files, so both are provided.

### Final verification evidence

- Full suite: `node --test --test-concurrency=2 tests/*.test.mjs` → 556 passed, 0 failed, 0 skipped/cancelled; exit 0; 211.99 seconds. Log: `node_modules/.cache/release-tests-final-20261101.tap`.
- All 26 affected entrypoints: Deno check exit 0. Log: `node_modules/.cache/release-deno-final-20261101.log`.
- Requested subset: 29/29. Corrected SQL migration/auth tests: 8/8. These overlap the full suite and must not be summed as unique tests.
- Node v24.20.0; Vite 8.3.5; build exit 0 with one large-chunk advisory. Lint zero errors/warnings. Full/prod audits zero known vulnerabilities.
- Git diff check passed. No commit, push or deployment.

### Git change summary

{"files":123,"tracked":63,"added":2109,"removed":1101,"newFiles":60}

```text
 deno.lock                                          |   24 +-
 package-lock.json                                  | 1594 ++++++++++++--------
 package.json                                       |   30 +-
 public/_headers                                    |    2 +-
 src/App.jsx                                        |    4 +
 src/components/AboutSection.jsx                    |    3 +
 src/components/CookieBanner.jsx                    |    4 +-
 src/components/ShopSection.jsx                     |   23 +-
 src/components/about/AboutStoryVideo.jsx           |   64 +-
 src/components/admin/AdminSignIn.jsx               |   68 +-
 src/components/haven/components/HavenDrawer.jsx    |   25 +-
 .../haven/components/chat/ChatMessage.jsx          |    2 +-
 src/components/layout/Footer.jsx                   |    3 +-
 src/components/layout/Header.jsx                   |    2 +-
 src/components/legal/DataDeletionModal.jsx         |    2 +-
 src/components/modals/BrandReviewModal.jsx         |    3 +-
 src/components/services/ServiceGrid.jsx            |   14 +-
 src/index.css                                      |   48 +-
 src/lib/adminAuth.js                               |    5 +
 src/lib/adminSession.js                            |    5 +-
 src/lib/cookieService.js                           |   23 +-
 src/lib/trackingUtils.js                           |    3 +-
 src/pages/AdminDashboard.jsx                       |   23 +-
 src/pages/AdminInvitePage.jsx                      |   67 +-
 src/pages/DataDeletionConfirmPage.jsx              |   54 +-
 src/pages/PrivacyPage.jsx                          |   11 +-
 src/pages/TermsPage.jsx                            |    6 +-
 supabase/config.toml                               |   36 +
 supabase/functions/_shared/admin-auth.ts           |   10 +
 supabase/functions/_shared/haven-knowledge.js      |   54 +-
 supabase/functions/_shared/haven-request.ts        |   20 +-
 supabase/functions/_shared/haven-routing.js        |   45 +-
 supabase/functions/_shared/provider-request.ts     |    5 +-
 supabase/functions/_shared/review-access.ts        |    4 +
 supabase/functions/admin-fetch-leads/index.ts      |   15 +
 .../functions/admin-retry-purchase-email/index.ts  |   16 +-
 supabase/functions/admin-team-assignment/index.ts  |   18 +-
 supabase/functions/admin-update-lead/index.ts      |   57 +-
 supabase/functions/capture-booking-lead/index.ts   |    2 +-
 supabase/functions/check-email-exists/index.ts     |    6 +-
 supabase/functions/confirm-data-deletion/index.ts  |  227 +--
 supabase/functions/create-brand-review/index.ts    |   20 +-
 supabase/functions/flag-user/index.ts              |   15 +-
 supabase/functions/haven-chat/index.ts             |   32 +-
 supabase/functions/paystack-webhook/index.ts       |    8 +-
 supabase/functions/request-data-deletion/index.ts  |    8 +-
 supabase/functions/score-social/index.ts           |   24 +-
 supabase/functions/scrape-website/index.ts         |   44 +-
 supabase/functions/sync-haven-session/index.ts     |    2 +-
 tests/about-video.test.mjs                         |   64 +-
 tests/admin-session.test.mjs                       |    2 +-
 tests/admin-tabs.test.mjs                          |   10 +-
 tests/final-security-integration.test.mjs          |   91 +-
 tests/haven-routing.test.mjs                       |   90 ++
 tests/haven-server.test.mjs                        |   66 +-
 tests/helpers/security-fixture.mjs                 |   22 +
 tests/legal-disclosures.test.mjs                   |   10 +-
 tests/navigation-ui.test.mjs                       |   11 +
 tests/playbook-ui.test.mjs                         |   22 +-
 tests/review-save-ui.test.mjs                      |    5 +-
 tests/review-security.test.mjs                     |   26 +-
 tests/tracking-consent.test.mjs                    |    7 +-
 vite.config.js                                     |    4 +-
 63 files changed, 2109 insertions(+), 1101 deletions(-)
```

### Full tracked and untracked status

```text
 M deno.lock
 M package-lock.json
 M package.json
 M public/_headers
 M src/App.jsx
 M src/components/AboutSection.jsx
 M src/components/CookieBanner.jsx
 M src/components/ShopSection.jsx
 M src/components/about/AboutStoryVideo.jsx
 M src/components/admin/AdminSignIn.jsx
 M src/components/haven/components/HavenDrawer.jsx
 M src/components/haven/components/chat/ChatMessage.jsx
 M src/components/layout/Footer.jsx
 M src/components/layout/Header.jsx
 M src/components/legal/DataDeletionModal.jsx
 M src/components/modals/BrandReviewModal.jsx
 M src/components/services/ServiceGrid.jsx
 M src/index.css
 M src/lib/adminAuth.js
 M src/lib/adminSession.js
 M src/lib/cookieService.js
 M src/lib/trackingUtils.js
 M src/pages/AdminDashboard.jsx
 M src/pages/AdminInvitePage.jsx
 M src/pages/DataDeletionConfirmPage.jsx
 M src/pages/PrivacyPage.jsx
 M src/pages/TermsPage.jsx
 M supabase/config.toml
 M supabase/functions/_shared/admin-auth.ts
 M supabase/functions/_shared/haven-knowledge.js
 M supabase/functions/_shared/haven-request.ts
 M supabase/functions/_shared/haven-routing.js
 M supabase/functions/_shared/provider-request.ts
 M supabase/functions/_shared/review-access.ts
 M supabase/functions/admin-fetch-leads/index.ts
 M supabase/functions/admin-retry-purchase-email/index.ts
 M supabase/functions/admin-team-assignment/index.ts
 M supabase/functions/admin-update-lead/index.ts
 M supabase/functions/capture-booking-lead/index.ts
 M supabase/functions/check-email-exists/index.ts
 M supabase/functions/confirm-data-deletion/index.ts
 M supabase/functions/create-brand-review/index.ts
 M supabase/functions/flag-user/index.ts
 M supabase/functions/haven-chat/index.ts
 M supabase/functions/paystack-webhook/index.ts
 M supabase/functions/request-data-deletion/index.ts
 M supabase/functions/score-social/index.ts
 M supabase/functions/scrape-website/index.ts
 M supabase/functions/sync-haven-session/index.ts
 M tests/about-video.test.mjs
 M tests/admin-session.test.mjs
 M tests/admin-tabs.test.mjs
 M tests/final-security-integration.test.mjs
 M tests/haven-routing.test.mjs
 M tests/haven-server.test.mjs
 M tests/helpers/security-fixture.mjs
 M tests/legal-disclosures.test.mjs
 M tests/navigation-ui.test.mjs
 M tests/playbook-ui.test.mjs
 M tests/review-save-ui.test.mjs
 M tests/review-security.test.mjs
 M tests/tracking-consent.test.mjs
 M vite.config.js
?? .github/dependabot.yml
?? .github/workflows/verify.yml
?? DEPLOYMENT_RUNBOOK_20261101.md
?? PRIVACY_OPERATIONS_20261101.md
?? PRODUCTION_SECURITY_AUDIT_20261101.md
?? scripts/list-affected-functions.mjs
?? scripts/security-smoke.mjs
?? src/components/SitePresence.jsx
?? src/components/admin/AdminMfaChallenge.jsx
?? src/components/admin/AdminMfaPanel.jsx
?? src/components/admin/AdminSecurityPanel.jsx
?? src/components/admin/SupportRequestsPanel.jsx
?? src/components/admin/VisitorActivityPanel.jsx
?? src/lib/adminMfa.js
?? src/lib/adminPassword.js
?? src/lib/cookiePreference.js
?? src/lib/sitePresence.js
?? src/pages/SupportPage.jsx
?? supabase/functions/_shared/admin-audit.ts
?? supabase/functions/_shared/ai-budget.ts
?? supabase/functions/_shared/cors.ts
?? supabase/functions/_shared/raw-body.ts
?? supabase/functions/_shared/screenshot-validation.ts
?? supabase/functions/_shared/zoho-support.ts
?? supabase/functions/admin-security/index.ts
?? supabase/functions/admin-support/index.ts
?? supabase/functions/record-cookie-consent/index.ts
?? supabase/functions/send-support-notification/index.ts
?? supabase/functions/site-presence/index.ts
?? supabase/functions/support-request/index.ts
?? supabase/functions/zoho-support-webhook/index.ts
?? supabase/manual/20261031_schedule_support.sql
?? supabase/manual/20261101_schedule_privacy.sql
?? supabase/manual/ZOHO_SUPPORT_SETUP.md
?? supabase/migrations/20261031000000_support_requests.sql
?? supabase/migrations/20261031000001_deletion_cleanup.sql
?? supabase/migrations/20261031000002_zoho_support.sql
?? supabase/migrations/20261031000003_calendly_vault_cron.sql
?? supabase/migrations/20261031000004_ai_budgets.sql
?? supabase/migrations/20261031000005_admin_audit.sql
?? supabase/migrations/20261031000006_visitor_activity.sql
?? supabase/migrations/20261101000000_privacy_operations.sql
?? supabase/migrations/20261101000001_site_presence.sql
?? supabase/migrations/20261101000002_admin_mfa.sql
?? tests/admin-mfa.test.mjs
?? tests/admin-password.test.mjs
?? tests/admin-security.test.mjs
?? tests/adversarial-boundaries.test.mjs
?? tests/ai-budget.test.mjs
?? tests/chat-view-isolation.test.mjs
?? tests/deletion-confirmation.test.mjs
?? tests/helpers/image-fixtures.mjs
?? tests/operations-cron.test.mjs
?? tests/privacy-operations.test.mjs
?? tests/screenshot-validation.test.mjs
?? tests/site-presence.test.mjs
?? tests/support-page-ui.test.mjs
?? tests/support-requests.test.mjs
?? tests/visitor-activity.test.mjs
?? tests/zoho-support.test.mjs
```

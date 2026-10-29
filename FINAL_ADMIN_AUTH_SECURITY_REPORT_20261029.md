# Haven completion report — 29 October 2026

Branch: **feat/admin-auth-and-final-polish** (created from `dev`).

All changes are local and uncommitted. Nothing was pushed, deployed, or applied to the live database. No real payments or live QA emails were sent in this pass.

## What changed

### Staff authentication and private data

- Replaced the shared admin password with Supabase Auth email/password sign-in. The SDK stores the staff session separately in session storage, refreshes tokens, restores a verified session on reload, and signs out locally.
- All five admin endpoints (`admin-fetch-leads`, `admin-update-lead`, `admin-team-assignment`, `admin-retry-purchase-email`, manual `flag-user`) now verify the JWT through `auth.getUser()` and require **trusted `app_metadata.role = admin`**. A normal authenticated customer, editable `user_metadata`, public key, old shared password, or manual service-key call does not grant administrator access.
- Kept internal AI flagging separate. Fixed a bypass where `source: ai` combined with `retryNotifications` could otherwise have skipped the new admin check.
- Admin JSON bodies are streamed with a 16 KB limit. Admin API requests share a 60/minute network budget. These are API limits; Supabase Auth's native login limits must also be configured in the dashboard.
- Public email lookup, booking capture, and deletion-request bodies are also streamed with a 4 KB limit before their narrow field validation.
- Added administrator SELECT policies to the relevant RLS tables. No authenticated customer gets unrestricted reads or writes. Frozen assignment email payloads and their private links remain excluded from direct authenticated SELECT privileges.
- Added `/admin/accept-invite` to set the invited staff member's password. The public Supabase client no longer consumes invitation URLs or persists staff Auth sessions.
- Old shared-password browser values are removed. Passwords and service-role keys are not sent in admin request bodies or embedded in the frontend.
- Retired the unused public `includeFlag` email lookup, which could disclose another person's moderation status. The existing rate-limited membership check still supports the review form; restriction status is checked through private Haven access.

### Assignment migration repair

- Corrected `20261028000000_team_assignments_and_booking_email.sql`: `inquiry_id` is **TEXT**, matching `haven_sessions.id`; `booking_id` remains **BIGINT**, matching `strategy_call_bookings.id`. The assignment's own ID remains UUID.
- Removed incorrect inquiry UUID casts and allowed the assignment endpoint to accept bounded TEXT inquiry IDs.
- The integration test now starts with **the actual `supabase/schema.sql` and applies the migration chain**, rather than inventing a UUID chat schema. This reproduces and prevents the foreign-key mismatch shown in the screenshot.

### Booking tracking and duplicate protection

- Both Review and Services booking paths now capture a verified browser identity before navigating to Calendly. Chat booking buttons also carry their actual scope/service; Team inquiries have their own source label.
- A private SQL transaction checks upcoming confirmed/active bookings by email, linked review, or verified visitor. It also reserves a booking attempt for 30 minutes, preventing overlapping cross-entry/cross-email attempts on that saved identity.
- The reservation is **not** displayed as a confirmed booking. If someone abandons Calendly, it expires. An existing confirmed call directs them to their Calendly confirmation instead of a second call.
- Calendly links carry the specific intent ID in `utm_content`. Polling and webhooks match that intent, rather than assigning whichever email intent happens to be newest. Untracked bookings remain direct Calendly/review matches instead of being falsely attributed to a service.
- Confirmation timestamps remain per invitee. Existing cancellation precedence, reschedule records, email retry fencing, and actual provider start/end times remain in place.
- Removed the old UI warning inferred from a clicked-link timestamp and the hardcoded availability sentence. Calendly supplies current availability.
- Limitation: a visitor who resets all identity storage and changes email/device, or uses Calendly directly, cannot be reliably identified as the same person. An application reservation cannot impose a global identity ban on an external Calendly page.

### Haven's conversation and support behaviour

- Fixed delegation recognition for “build me a more professional website like yours” and “I want mine to be like yours.” A previous support topic no longer traps a substantive implementation request.
- Regression tests cover using the saved user request after a stopped turn. Cancelled assistant completions remain fenced by the existing server turn controls.
- Recovery guidance now describes the real Shop UI: `Already purchased` is **inside** the Playbook panel. Valid saved purchase access may display a download instead. Haven does not invent `/shop`, a link below the card, a support ticket, or advise clearing saved access.
- Added a real `mailto:info@themarketinghaven.xyz` support action.
- Quick prompts now match Support, Review, Services, and Team inquiry. Both full and compact chat surfaces use the shared question definitions; compact action buttons now perform navigation instead of being inert.
- Removed compulsory Chapter 5 references from fallback Playbook recommendations. Brief, appropriate model-written explanations are retained; checkout pricing stays in the Shop unless directly asked.
- Internal step/lead/memory/decision metadata is removed from user-facing response text after parsing. Action markers required by the existing button UI remain supported.
- Added an 8-message/minute visitor limit and 30-message/minute network limit alongside the existing longer budgets. Retry responses carry the actual cooldown while the saved turn/context is retained.
- Plain chat input strips unsafe control characters while preserving normal Unicode, tabs, and line breaks. This is input hygiene, not a claim that sanitization alone solves prompt injection.
- The existing evidence-based scoring, correction/re-upload controls, private review recovery, paid-book knowledge checks, and manual prompt improvement approach remain intact. No autonomous training or fine-tuning pipeline was added.

### Purchases and recovery

- Before preparing another checkout, the server checks whether a purchase is already recorded for the checkout email. The UI then opens secure recovery instead of charging that buyer again.
- Fresh verified purchases still open their download directly, without an OTP. Recovery on another device or without saved proof still requires the emailed code. The charge remains **₦9,639 / 963,900 kobo**.
- Added atomic attempt tracking across rotated email/reference pairs: five failures, a 60-second cooldown, two further attempts, then a saved-device verification lock. Shared-network locks expire after one hour; they are not permanent behaviour restrictions.
- Valid receipt details cannot reset failed OTP attempts. Only a correctly verified email code can clear the saved-device failure count. General request/mail limits still apply independently.
- Locked-device errors provide a non-secret support reference. Admin now has a **Verification locks** section to reset attempts after a support review. Resetting attempts does not issue a download grant, skip OTP, or clear moderation restrictions.
- Existing accounting keeps separate real transaction references; duplicate real charges are not silently discarded or automatically refunded. Parallel/provider-side payment races still require live checkout testing; this is not a guarantee against every possible duplicate charge outside the application flow.
- Different review and checkout emails are not treated as fraud by themselves. One download action per page visit and future recovery remain supported.

### Flag notifications

- Anonymous guest restrictions remain visible and enforceable in Admin, but no team email is sent for those guest-only events, as requested in this latest task.
- Skipped guest notices have their own timestamp; they are not falsely marked as accepted by Resend. Queue health excludes those skipped team notices.
- Identified user flag alerts still go to **both francis.teamhaven@gmail.com and paschal.tmh@gmail.com**. Existing identified-user warning/restriction emails remain separate.

### API usage and operational alerts

- Added provider-reported Gemini and Groq token usage for **chat and scoring**. Gemini's total includes reported thinking usage; missing usage is labelled rather than guessed.
- Added the Admin **API Usage** section, grouped by provider/model for the current UTC day, including failures and unreported usage.
- Added a private, durable alert queue and `send-ai-usage-alerts`. It alerts both team inboxes for a daily own-budget threshold, provider rate/quota limits, and temporary unavailability. Threshold defaults to 800,000 tokens/provider/day and can be changed with `AI_DAILY_TOKEN_ALERT_THRESHOLD`.
- Alerts are deduplicated by UTC day/provider/type, workers claim them atomically, and Resend receives stable idempotency keys. Failures retain a safe delivery error for retry. Automatic retries stop before Resend's deduplication window expires; old unsent alerts need manual review rather than a blind resend.
- **This measures TMH's recorded API activity, not Google's remaining credits or exact quota.** Billing dashboards remain the source for provider balances. A failed usage-record write is logged; counters cannot reconstruct calls made by older deployments or other applications.

### Video, presentation, and cleanup

- Kept the centred transparent glass Play button and inline playback. Removed fullscreen and the video's own entrance reveal, including its parent wrapper. No poster covers the preview.
- Muted looping preview starts where autoplay/data-saving/reduced-motion rules permit. Active playback uses play/pause, seek, and volume controls; the control bar hides after two idle seconds and returns on interaction/focus/pause.
- X saves the audible position for that source in the current tab, then returns to the muted looping preview. Reopening resumes that position; completing the video clears it. No popup player is created.
- Added the explicit **Contact Information** footer heading; existing email, WhatsApp, and Lagos links remain.
- Added Netlify security headers: CSP, HSTS, nosniff, frame protection, referrer policy, and feature permissions. The CSP does not permit `unsafe-eval`; inline styles remain necessary for the existing motion/UI libraries. Third-party checkout/CAPTCHA/video behaviour must be smoke-tested with the deployed headers.
- Removed unused imports, empty catches and stale draft initializers, improved pagination/scroll updates, and documented narrowly scoped lint exceptions for intentional browser/server hydration and established context exports. No global lint rule was disabled.

## Verification results

| Check | Result |
| --- | --- |
| Full Node suite | **418 passed, 0 failed** |
| Requested command: `node --test tests/backend-tasks.test.mjs tests/booking-ui.test.mjs tests/playbook-ui.test.mjs` | **28 passed, 0 failed** |
| ESLint | **0 errors, 0 warnings** |
| Deno | All **22 affected Edge Functions** passed type checking |
| Production build | Passed; main bundle about 851 KB / 251 KB gzip. Existing >500 KB chunk warning remains. |
| `git diff --check` | Passed |
| SQL integration | Actual base schema plus migration chain compiled and executed in PGlite/PostgreSQL; tested RLS roles, FK types, booking concurrency, verification cooldown/lock, token aggregates, and alert claims. Cron/Vault/provider services are external and were not simulated as live services. |
| Local browser | Verified centred inline video controls and return to muted preview, scoped Support prompt cards, footer contacts, and logged-out admin sign-in. |

Final runs have no failing test error output. The earlier stale fixture failures were corrected to use JWT authentication and explicit booking correlation.

## Deployment order — required before testing production

### 1. Apply SQL

If the earlier assignment migration failed, apply the corrected **20261028000000_team_assignments_and_booking_email.sql** first. If it already succeeded, inspect its types before rerunning a non-idempotent migration.

Then apply these new migrations in filename order:

1. `20261029000000_admin_auth_rls.sql`
2. `20261029000001_booking_guards.sql`
3. `20261029000002_ai_usage.sql`
4. `20261029000003_verification_attempts.sql`
5. `20261029000004_guest_notification_preferences.sql`

These depend on the earlier migrations through 20261028000001. Do not reapply `supabase/schema.sql` to production: the integration test uses it only to build a disposable test database, and that base file contains superseded access policies.

### 2. Configure and invite staff

- In Supabase Authentication, enable email/password accounts and configure strong-password and native Auth rate-limit settings. There is no public sign-up screen in this implementation; ordinary accounts still cannot become administrators.
- Add `https://themarketinghaven.xyz/admin/accept-invite` to allowed redirect URLs. Since this site's Supabase Auth is for staff, use that URL as the Auth Site URL for dashboard-generated invitations, or use the server-side admin invite API with that explicit `redirectTo`.
- Configure **Auth Custom SMTP** for production invitation mail. An Edge Function's `RESEND_API_KEY` secret does not configure Supabase Auth email delivery. With Resend SMTP, use host `smtp.resend.com`, port `465`, username `resend`, your Resend key as the SMTP password, and your verified sender. Enter credentials only in Supabase settings.
- Invite only the intended staff administrator through Authentication → Users → Invite user. Before they accept the invitation, grant the trusted role using the SQL Editor. Replace the placeholder with exactly that invited account:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"admin"}'::jsonb
where lower(email) = lower('REPLACE_WITH_INVITED_ADMIN_EMAIL');
```

- The recipient opens the invitation, sets their own password, then signs in at `/admin`. Alert recipients and assignment recipients do not automatically become administrators. Do not put this role in `user_metadata`, and never put a service-role key into a Vite environment variable.
- If an invitation opens the homepage, correct the redirect allowlist/Site URL and issue a fresh invitation. If the role is absent, the account is intentionally denied.

Official references: [Supabase invitations and trusted user metadata](https://supabase.com/docs/guides/auth/users), [Supabase Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend SMTP settings](https://resend.com/docs/send-with-smtp).

### 3. Deploy affected Edge Functions

The dependency scan includes changed shared modules, not just changed `index.ts` files. Deploy all functions in the appendix using the existing project and configuration. For PowerShell:

```powershell
$havenFunctions = @(
  'admin-fetch-leads','admin-retry-purchase-email','admin-team-assignment','admin-update-lead',
  'calendly-poll-bookings','calendly-webhook','capture-booking-lead','check-email-exists',
  'create-brand-review','flag-user','haven-chat','paystack-webhook','request-data-deletion',
  'request-playbook-recovery','score-social','scrape-website','send-ai-usage-alerts',
  'send-flag-alert','sync-haven-session','update-review-source','verify-paystack','verify-playbook-recovery'
)
foreach ($havenFunction in $havenFunctions) {
  supabase functions deploy $havenFunction --project-ref dkpoygkduktusrnsbpaq
  if ($LASTEXITCODE -ne 0) { throw "Deployment failed: $havenFunction" }
}
```

Keep existing mail/provider secrets. New optional secret: `AI_DAILY_TOKEN_ALERT_THRESHOLD=800000`. The new worker accepts the existing `INTERNAL_POLL_SECRET` for its cron invocation. No new frontend secret is required.

### 4. Schedule operational alerts

In Supabase Vault, save the same Edge `INTERNAL_POLL_SECRET` value as **tmh_internal_poll_secret**. Then run `supabase/manual/20261029_schedule_ai_alerts.sql`. It schedules a five-minute alert drain and daily retention cleanup. Do not commit an actual secret into that SQL.

Existing Calendly polling and optional post-purchase follow-up schedules remain required; this new schedule does not replace them. Inspect `cron.job` and recent `net` responses to verify actual execution.

### 5. Deploy the frontend yourself

Deploy this branch through your normal Git/Netlify workflow after reviewing it. Staff backend authentication and the new frontend must be rolled out together; the old shared-password admin page will no longer work against the updated admin endpoints. Netlify must publish the generated `dist/_headers` and keep the SPA route rewrite for `/admin/accept-invite`.

## Production tests before launch

1. **Staff access:** invitation → set password → sign in → refresh → token refresh → sign out → Back/reload. No private records should reappear after sign-out. Confirm a normal customer/forged JWT/old shared password cannot fetch leads, transcripts, purchases, assignments, or perform updates.
2. **Assignments:** load an upcoming BIGINT booking and a TEXT Team inquiry; save a teammate/note; send once; retry; open the recipient brief; replace/revoke it and confirm the previous link fails. Do not assign full admin access just to read a brief.
3. **Bookings:** book from Review, then attempt Services with the same browser and a different email. Confirm the guard uses the actual synced booking. Test an abandoned reservation, different services, cancellation, reschedule and both timezones. Check the exact source/service on each row and confirm a stale email intent does not win.
4. **Haven:** repeat the screenshot's support → missing recovery tab → website rebuild request; stop a response after stating the requirement, then ask to proceed. It should use the saved requirement instead of repeating its first diagnostic question. Test genuine criticism, a lawful premium audience, and repeated targeted abuse separately.
5. **Recovery/payments:** pay ₦9,639 once and obtain a direct download; request recovery in a different browser and confirm the emailed code; try wrong/expired/replayed codes; verify five failures → minute cooldown → two more → saved-device lock. Check the Admin reset and a shared-network cooldown. Attempt buying again with the already-paid checkout email. Keep separate valid charge references if a duplicate real payment occurs.
6. **Flags:** an anonymous restricted visitor should be blocked and appear in Admin, with no team email. An identified yellow/red event should reach both team inboxes and the appropriate customer inbox, without resending an accepted channel on retry.
7. **Usage alerts:** temporarily set a small own-budget threshold, make a controlled request, verify real token counts in Admin and one alert to both inboxes after cron. Restore the intended threshold. Test a transient provider failure without conflating it with exhausted credit.
8. **Deployed CSP:** check Paystack, hCaptcha, YouTube, fonts, private screenshot previews and recovery downloads in the browser console. The Vite preview does not serve Netlify's production response headers.
9. **Real devices:** test iPhone Safari keyboard opening/closing, long messages and scrolling, and inline video seek/volume/return-to-preview. A desktop browser and component tests do not establish real iOS keyboard correctness.
10. **Three-owner beta:** one website-led business, one social/WhatsApp-led business, and one starting without a page. Ask each to finish a review, explain what the score does/does not measure, follow Haven's next step, recover a purchase if applicable, and report confusion in their own words. Use actual saved transcripts to refine prompts manually.

## Gemini and launch assessment

The configured default remains **gemini-3.8-flash**, with bounded transient retry and Groq fallback. Google documents that model ID and `low` thinking support. A **503 means temporary service unavailability/overload**, not proof that free tokens are exhausted. Enabling billing may change eligible limits; it does not guarantee the disappearance of 503s. Verify a real `generateContent` request in the deployed environment: a metadata health check alone does not establish inference access. [Model reference](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [Google troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting).

The identified code defects are addressed and local checks pass. This is **ready for deployment and the production acceptance tests above**, not a claim that the live system is already verified or immune to attacks. Remaining external gates are Auth/SMTP configuration, SQL application, function/frontend deployment, cron execution, real provider/mail/payment checks and iPhone testing. Staff MFA, broader load testing and further bundle splitting remain useful follow-up work; they were not silently represented as completed here.

Calendly source tracking follows its documented UTM payload support: [Calendly developer FAQ](https://developer.calendly.com/docs/getting-started/frequently-asked-questions). Netlify response-header guidance: [Netlify CSP](https://docs.netlify.com/manage/security/content-security-policy/).

## Exact change inventory and Git outputs

75 tracked files changed; 21 new files. `git diff --stat` counts tracked changes only.

### Frontend

- Updated: `src/App.jsx`
- Updated: `src/components/AboutSection.jsx`
- Updated: `src/components/Navbar.jsx`
- Updated: `src/components/Preloader.jsx`
- Updated: `src/components/ShopSection.jsx`
- Updated: `src/components/TestimonialsSection.jsx`
- Updated: `src/components/about/AboutStoryVideo.jsx`
- Updated: `src/components/about/PersonModal.jsx`
- Updated: `src/components/about/TeamSlideshow.jsx`
- New: `src/components/admin/APIUsagePanel.jsx`
- New: `src/components/admin/AdminSignIn.jsx`
- New: `src/components/admin/VerificationAttemptsPanel.jsx`
- Updated: `src/components/haven/components/ActionModals.jsx`
- Updated: `src/components/haven/components/HavenDrawer.jsx`
- Updated: `src/components/haven/components/HavenInlineModal.jsx`
- Updated: `src/components/haven/components/chat/ChatMessage.jsx`
- New: `src/components/haven/config/quick-prompts.js`
- Updated: `src/components/haven/context/HavenContext.jsx`
- Updated: `src/components/haven/utils/reviewPersistence.js`
- Updated: `src/components/layout/Footer.jsx`
- Updated: `src/components/modals/BrandReviewModal.jsx`
- Updated: `src/components/review/HavenChat.jsx`
- Updated: `src/components/review/ReviewForm.jsx`
- Updated: `src/components/ui/ConfirmModal.jsx`
- Updated: `src/context/ThemeContext.jsx`
- Updated: `src/context/UserContext.jsx`
- New: `src/lib/adminAuth.js`
- New: `src/lib/adminSession.js`
- Updated: `src/lib/supabase.js`
- Updated: `src/pages/AdminDashboard.jsx`
- New: `src/pages/AdminInvitePage.jsx`
- Updated: `src/pages/PrivacyPage.jsx`
- Updated: `src/pages/TermsPage.jsx`

### Database and backend

- Updated: `supabase/config.toml`
- Updated: `supabase/functions/_shared/admin-auth.ts`
- New: `supabase/functions/_shared/ai-usage.ts`
- Updated: `supabase/functions/_shared/calendly-bookings.ts`
- Updated: `supabase/functions/_shared/haven-knowledge.js`
- Updated: `supabase/functions/_shared/haven-limits.ts`
- Updated: `supabase/functions/_shared/haven-moderation.ts`
- Updated: `supabase/functions/_shared/haven-request.ts`
- Updated: `supabase/functions/_shared/haven-routing.js`
- New: `supabase/functions/_shared/verification-attempts.ts`
- Updated: `supabase/functions/admin-fetch-leads/index.ts`
- Updated: `supabase/functions/admin-retry-purchase-email/index.ts`
- Updated: `supabase/functions/admin-team-assignment/index.ts`
- Updated: `supabase/functions/admin-update-lead/index.ts`
- Updated: `supabase/functions/calendly-poll-bookings/index.ts`
- Updated: `supabase/functions/calendly-webhook/index.ts`
- Updated: `supabase/functions/capture-booking-lead/index.ts`
- Updated: `supabase/functions/check-email-exists/index.ts`
- Updated: `supabase/functions/flag-user/index.ts`
- Updated: `supabase/functions/haven-chat/index.ts`
- Updated: `supabase/functions/request-data-deletion/index.ts`
- Updated: `supabase/functions/request-playbook-recovery/index.ts`
- Updated: `supabase/functions/score-social/index.ts`
- Updated: `supabase/functions/scrape-website/index.ts`
- New: `supabase/functions/send-ai-usage-alerts/index.ts`
- Updated: `supabase/functions/send-flag-alert/index.ts`
- Updated: `supabase/functions/verify-paystack/index.ts`
- Updated: `supabase/functions/verify-playbook-recovery/index.ts`
- New: `supabase/manual/20261029_schedule_ai_alerts.sql`
- Updated: `supabase/migrations/20261028000000_team_assignments_and_booking_email.sql`
- New: `supabase/migrations/20261029000000_admin_auth_rls.sql`
- New: `supabase/migrations/20261029000001_booking_guards.sql`
- New: `supabase/migrations/20261029000002_ai_usage.sql`
- New: `supabase/migrations/20261029000003_verification_attempts.sql`
- New: `supabase/migrations/20261029000004_guest_notification_preferences.sql`

### Tests

- Updated: `tests/about-video.test.mjs`
- Updated: `tests/admin-diagnostics.test.mjs`
- Updated: `tests/admin-email-status.test.mjs`
- Updated: `tests/admin-flags-ui.test.mjs`
- Updated: `tests/admin-management.test.mjs`
- New: `tests/admin-session.test.mjs`
- Updated: `tests/admin-tabs.test.mjs`
- New: `tests/api-alerts.test.mjs`
- Updated: `tests/backend-tasks.test.mjs`
- Updated: `tests/booking-ui.test.mjs`
- Updated: `tests/calendly-polling.test.mjs`
- Updated: `tests/email-lookup.test.mjs`
- Updated: `tests/final-knowledge-emails.test.mjs`
- New: `tests/final-security-integration.test.mjs`
- Updated: `tests/flag-alerts.test.mjs`
- Updated: `tests/haven-server.test.mjs`
- Updated: `tests/haven-sync-client.test.mjs`
- Updated: `tests/helpers/security-fixture.mjs`
- Updated: `tests/paystack-purchases.test.mjs`
- Updated: `tests/playbook-recovery.test.mjs`
- Updated: `tests/playbook-ui.test.mjs`
- Updated: `tests/purchase-followup.test.mjs`
- Updated: `tests/request-security.test.mjs`
- Updated: `tests/review-security.test.mjs`
- Updated: `tests/team-assignment-sql.test.mjs`
- Updated: `tests/user-flags.test.mjs`

### Hosting

- New: `public/_headers`

Report: `FINAL_ADMIN_AUTH_SECURITY_REPORT_20261029.md`.

### git diff --stat

```text
 src/App.jsx                                        |   2 +
 src/components/AboutSection.jsx                    |  11 +-
 src/components/Navbar.jsx                          |   2 +-
 src/components/Preloader.jsx                       |   2 +-
 src/components/ShopSection.jsx                     |  11 +-
 src/components/TestimonialsSection.jsx             |   6 +-
 src/components/about/AboutStoryVideo.jsx           |  38 ++--
 src/components/about/PersonModal.jsx               |   2 +-
 src/components/about/TeamSlideshow.jsx             |   2 +-
 src/components/haven/components/ActionModals.jsx   |   6 +-
 src/components/haven/components/HavenDrawer.jsx    |  90 +++-------
 .../haven/components/HavenInlineModal.jsx          |  27 +--
 .../haven/components/chat/ChatMessage.jsx          |   1 +
 src/components/haven/context/HavenContext.jsx      |  12 +-
 src/components/haven/utils/reviewPersistence.js    |   4 +-
 src/components/layout/Footer.jsx                   |   1 +
 src/components/modals/BrandReviewModal.jsx         |   1 +
 src/components/review/HavenChat.jsx                |  26 +--
 src/components/review/ReviewForm.jsx               |   3 +-
 src/components/ui/ConfirmModal.jsx                 |   2 +-
 src/context/ThemeContext.jsx                       |   5 +-
 src/context/UserContext.jsx                        |   5 +-
 src/lib/supabase.js                                |   5 +-
 src/pages/AdminDashboard.jsx                       | 193 +++++++++------------
 src/pages/PrivacyPage.jsx                          |   2 +-
 src/pages/TermsPage.jsx                            |   2 +-
 supabase/config.toml                               |   3 +
 supabase/functions/_shared/admin-auth.ts           |  41 ++---
 supabase/functions/_shared/calendly-bookings.ts    |  13 +-
 supabase/functions/_shared/haven-knowledge.js      |   6 +-
 supabase/functions/_shared/haven-limits.ts         |   4 +-
 supabase/functions/_shared/haven-moderation.ts     |   6 +-
 supabase/functions/_shared/haven-request.ts        |   2 +-
 supabase/functions/_shared/haven-routing.js        |  21 ++-
 supabase/functions/admin-fetch-leads/index.ts      |  25 ++-
 .../functions/admin-retry-purchase-email/index.ts  |  12 +-
 supabase/functions/admin-team-assignment/index.ts  |  15 +-
 supabase/functions/admin-update-lead/index.ts      |  23 +--
 supabase/functions/calendly-poll-bookings/index.ts |   7 +-
 supabase/functions/calendly-webhook/index.ts       |   7 +-
 supabase/functions/capture-booking-lead/index.ts   |  23 ++-
 supabase/functions/check-email-exists/index.ts     |   7 +-
 supabase/functions/flag-user/index.ts              |  23 +--
 supabase/functions/haven-chat/index.ts             |  28 +--
 supabase/functions/request-data-deletion/index.ts  |   4 +-
 .../functions/request-playbook-recovery/index.ts   |   8 +-
 supabase/functions/score-social/index.ts           |  11 +-
 supabase/functions/scrape-website/index.ts         |  22 ++-
 supabase/functions/send-flag-alert/index.ts        |   7 +-
 supabase/functions/verify-paystack/index.ts        |   3 +
 .../functions/verify-playbook-recovery/index.ts    |   6 +-
 ...28000000_team_assignments_and_booking_email.sql |   8 +-
 tests/about-video.test.mjs                         |   6 +-
 tests/admin-diagnostics.test.mjs                   |  13 +-
 tests/admin-email-status.test.mjs                  |   8 +-
 tests/admin-flags-ui.test.mjs                      |   7 +-
 tests/admin-management.test.mjs                    |  31 ++--
 tests/admin-tabs.test.mjs                          |  22 +--
 tests/backend-tasks.test.mjs                       |  28 ++-
 tests/booking-ui.test.mjs                          |  21 +--
 tests/calendly-polling.test.mjs                    |   9 +-
 tests/email-lookup.test.mjs                        |  15 +-
 tests/final-knowledge-emails.test.mjs              |  11 +-
 tests/flag-alerts.test.mjs                         |   5 +-
 tests/haven-server.test.mjs                        |  10 ++
 tests/haven-sync-client.test.mjs                   |   2 +-
 tests/helpers/security-fixture.mjs                 |  14 ++
 tests/paystack-purchases.test.mjs                  |  21 +--
 tests/playbook-recovery.test.mjs                   |   3 +-
 tests/playbook-ui.test.mjs                         |   5 +-
 tests/purchase-followup.test.mjs                   |   2 +-
 tests/request-security.test.mjs                    |  31 ++--
 tests/review-security.test.mjs                     |   2 +-
 tests/team-assignment-sql.test.mjs                 |   2 +-
 tests/user-flags.test.mjs                          |  21 +--
 75 files changed, 563 insertions(+), 522 deletions(-)
```

### git status

```text
On branch feat/admin-auth-and-final-polish
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   src/App.jsx
	modified:   src/components/AboutSection.jsx
	modified:   src/components/Navbar.jsx
	modified:   src/components/Preloader.jsx
	modified:   src/components/ShopSection.jsx
	modified:   src/components/TestimonialsSection.jsx
	modified:   src/components/about/AboutStoryVideo.jsx
	modified:   src/components/about/PersonModal.jsx
	modified:   src/components/about/TeamSlideshow.jsx
	modified:   src/components/haven/components/ActionModals.jsx
	modified:   src/components/haven/components/HavenDrawer.jsx
	modified:   src/components/haven/components/HavenInlineModal.jsx
	modified:   src/components/haven/components/chat/ChatMessage.jsx
	modified:   src/components/haven/context/HavenContext.jsx
	modified:   src/components/haven/utils/reviewPersistence.js
	modified:   src/components/layout/Footer.jsx
	modified:   src/components/modals/BrandReviewModal.jsx
	modified:   src/components/review/HavenChat.jsx
	modified:   src/components/review/ReviewForm.jsx
	modified:   src/components/ui/ConfirmModal.jsx
	modified:   src/context/ThemeContext.jsx
	modified:   src/context/UserContext.jsx
	modified:   src/lib/supabase.js
	modified:   src/pages/AdminDashboard.jsx
	modified:   src/pages/PrivacyPage.jsx
	modified:   src/pages/TermsPage.jsx
	modified:   supabase/config.toml
	modified:   supabase/functions/_shared/admin-auth.ts
	modified:   supabase/functions/_shared/calendly-bookings.ts
	modified:   supabase/functions/_shared/haven-knowledge.js
	modified:   supabase/functions/_shared/haven-limits.ts
	modified:   supabase/functions/_shared/haven-moderation.ts
	modified:   supabase/functions/_shared/haven-request.ts
	modified:   supabase/functions/_shared/haven-routing.js
	modified:   supabase/functions/admin-fetch-leads/index.ts
	modified:   supabase/functions/admin-retry-purchase-email/index.ts
	modified:   supabase/functions/admin-team-assignment/index.ts
	modified:   supabase/functions/admin-update-lead/index.ts
	modified:   supabase/functions/calendly-poll-bookings/index.ts
	modified:   supabase/functions/calendly-webhook/index.ts
	modified:   supabase/functions/capture-booking-lead/index.ts
	modified:   supabase/functions/check-email-exists/index.ts
	modified:   supabase/functions/flag-user/index.ts
	modified:   supabase/functions/haven-chat/index.ts
	modified:   supabase/functions/request-data-deletion/index.ts
	modified:   supabase/functions/request-playbook-recovery/index.ts
	modified:   supabase/functions/score-social/index.ts
	modified:   supabase/functions/scrape-website/index.ts
	modified:   supabase/functions/send-flag-alert/index.ts
	modified:   supabase/functions/verify-paystack/index.ts
	modified:   supabase/functions/verify-playbook-recovery/index.ts
	modified:   supabase/migrations/20261028000000_team_assignments_and_booking_email.sql
	modified:   tests/about-video.test.mjs
	modified:   tests/admin-diagnostics.test.mjs
	modified:   tests/admin-email-status.test.mjs
	modified:   tests/admin-flags-ui.test.mjs
	modified:   tests/admin-management.test.mjs
	modified:   tests/admin-tabs.test.mjs
	modified:   tests/backend-tasks.test.mjs
	modified:   tests/booking-ui.test.mjs
	modified:   tests/calendly-polling.test.mjs
	modified:   tests/email-lookup.test.mjs
	modified:   tests/final-knowledge-emails.test.mjs
	modified:   tests/flag-alerts.test.mjs
	modified:   tests/haven-server.test.mjs
	modified:   tests/haven-sync-client.test.mjs
	modified:   tests/helpers/security-fixture.mjs
	modified:   tests/paystack-purchases.test.mjs
	modified:   tests/playbook-recovery.test.mjs
	modified:   tests/playbook-ui.test.mjs
	modified:   tests/purchase-followup.test.mjs
	modified:   tests/request-security.test.mjs
	modified:   tests/review-security.test.mjs
	modified:   tests/team-assignment-sql.test.mjs
	modified:   tests/user-flags.test.mjs

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	FINAL_ADMIN_AUTH_SECURITY_REPORT_20261029.md
	public/_headers
	src/components/admin/APIUsagePanel.jsx
	src/components/admin/AdminSignIn.jsx
	src/components/admin/VerificationAttemptsPanel.jsx
	src/components/haven/config/quick-prompts.js
	src/lib/adminAuth.js
	src/lib/adminSession.js
	src/pages/AdminInvitePage.jsx
	supabase/functions/_shared/ai-usage.ts
	supabase/functions/_shared/verification-attempts.ts
	supabase/functions/send-ai-usage-alerts/
	supabase/manual/
	supabase/migrations/20261029000000_admin_auth_rls.sql
	supabase/migrations/20261029000001_booking_guards.sql
	supabase/migrations/20261029000002_ai_usage.sql
	supabase/migrations/20261029000003_verification_attempts.sql
	supabase/migrations/20261029000004_guest_notification_preferences.sql
	tests/admin-session.test.mjs
	tests/api-alerts.test.mjs
	tests/final-security-integration.test.mjs

no changes added to commit (use "git add" and/or "git commit -a")
```

# Final completion: Haven knowledge, emails, assignments, UX and request security

28 October 2026 · Branch: `feat/final-knowledge-and-emails`

This pass implements the supplied completion brief. No commit, push, frontend publication, Supabase migration/deployment or live email was performed. Browser assignment checks used an isolated fixture with a simulated mail response. Live delivery and production configuration remain deployment checks.

## What changed

### Haven's public website knowledge

Expanded `supabase/functions/_shared/haven-knowledge.js`. The existing server prompt builder injects this block into Haven's conversations; regression tests check its inclusion across entry modes.

- Free class title, homepage location, its distinction from the Playbook, availability and basic player troubleshooting.
- About video: muted preview, autoplay limitations, centred Play/speaker controls, inline sound playback, tap to pause/resume and X to return to preview.
- Cookie banner: Accept All, Decline, dismiss-as-decline, saved preference and essential storage. Clearing all storage is not routine support advice.
- Current price ₦9,639 and crossed-out reference/list price ₦15,000. Haven may explain them when asked, without inventing a deadline, historical sales or future increase.
- One optional Chapter 5 purchase check-in, unchecked at checkout, due approximately 24 hours after payment, Services action, cancellation link and delivery limitations.
- Navigation, team cards, testimonial video availability, finding a downloaded file, fresh checkout versus recovery, and the actual Calendly joining invitation.
- Preserved the service descriptions, guarded routing, reader access rules, secure review recovery and explicit limits on actions Haven can perform.

Knowledge remains curated public information. Haven cannot inspect someone's browser, inbox or payment account, and cannot claim to have fixed an issue or contacted a teammate without a real tool result.

### Free class correction

The class still had `REPLACE_WITH_VIDEO_ID`. The player now uses the public frontend setting `VITE_FREE_CLASS_VIDEO_ID`, validates an 11-character YouTube ID and shows a clear preparation message until a real video is supplied. It no longer loads a knowingly broken embed. The play affordance remains, and it is keyboard-accessible.

### Booking confirmation email

`send-tmh-booking-confirmation` now uses the shared editorial template for new bookings, with HTML and text alternatives, a known saved name where available, the selected service and the requested sign-off/brand line.

- Subject: **Your strategy call with The Marketing Haven**.
- Button: **Contact Team Haven**, opening the public support email.
- Explains that Calendly sends the actual joining link and reschedule/cancellation controls. It does not label a scheduling URL as a meeting link.
- Uses the shared trimmed Resend configuration, verified-domain sender default and safe delivery diagnostics.
- Saves an immutable provider payload and provider acknowledgement so a database-marker repair can retry without sending another email.
- New confirmations are tracked per Calendly invitee/booking. Previously, a flag from an earlier appointment on the same lead or intent could suppress a later appointment's confirmation.
- Existing records retain their legacy pending template/key to avoid changing a retry's payload or silently resending previously accepted emails. Newly recorded bookings use the editorial version, including new appointments for existing leads.

### Bookings and team inquiries

Bookings now show full service names, offer a service filter, show Lagos time alongside the existing device/invitee information and expose the saved TMH confirmation flag separately from Calendly's invitation.

Added explicit assignment controls to **Bookings** and **Team Inquiries**:

1. Select a current public team member.
2. Enter their work email and a preparation note, up to 2,000 characters.
3. **Save assignment / new link** saves responsibility and creates/replaces its private access revision.
4. **Send notification email** explicitly requests the saved notification. Saving alone sends nothing.
5. Inspect provider acceptance/error, link expiry and teammate acknowledgement. Reload saved details to refresh these states.
6. **Withdraw link** immediately invalidates brief access. Saving a fresh revision also invalidates the previous link.

The inquiry's existing internal owner label is updated when an assignment is saved. Existing inquiry-edit revision checks continue to protect concurrent changes; if an older open follow-up draft conflicts, reload its saved details before saving it.

### Private preparation brief

Two new functions: `admin-team-assignment` and `read-team-assignment`. The frontend route is `/team-brief`.

- Admin operations require the existing server-side admin password. A public key cannot create assignments or send mail.
- The emailed link grants access only to its assignment, expires seven days after saving and can be withdrawn. It does not grant admin access.
- HMAC covers the assignment ID, revision and expiry. The database's current revision, expiry and revocation state are also checked.
- The token travels in the URL fragment, is removed from the address bar on opening and is sent to the read endpoint in the request body. It is not persisted in browser storage. The brief route has no homepage tracking/Haven provider, uses no-referrer/no-store and adds noindex metadata.
- A recipient sees the assigned name, preparation note and relevant saved client, service, goal and meeting details. Full transcripts, screenshots, credentials, provider payloads and unrelated records are excluded.
- The meeting's current status is read from saved booking data; cancelled meetings display a warning. Calendar organizer invitations remain the source of joining details.
- Opening a link does not acknowledge it automatically. The teammate must press **Acknowledge assignment**.
- Notifications use frozen payloads, a stable provider key, a one-minute attempt lease and a bounded retry window. Stored provider acceptance can repair the status without resending.
- Keep the email private: anyone holding its active link can read that brief. This is limited bearer access, not proof of the recipient's personal identity. Reloading the brief requires reopening the email link after its fragment has been removed.

## Added brief: conversation, video and abuse protection

The later continuation brief was completed on the same branch, without discarding the first pass.

### Free call wording and Playbook recommendations

- The system prompt explicitly distinguishes the **free strategy call** from any later paid execution.
- Server routing normalizes strategy-call wording to include **free**, including fallback recommendations. The chat action now reads **Book a Free Strategy Call**. The BookingModal header already read **Book Your Free Strategy Call** and remains correct.
- Accepted Playbook recommendations use the supported business need and a relevant public topic rather than “the learning need we discussed.” Generic model copy is rejected in favour of a more useful contextual fallback. Chapter 5 is named accurately where appropriate; this does not disclose private chapters or claim a guaranteed fix.
- Broken-link, lost-file, different-device and delayed-code support requests have distinct, practical responses. They avoid asking the buyer to pay twice and keep credentials in the recovery panel. A general download question does not automatically assume the visitor has already purchased.

### Single custom video controls

- Removed the native video controls entirely from the inline player.
- One custom glass play/pause control remains, with a seek slider, time display, mute/volume and supported fullscreen controls. Clicking the video still toggles playback. The preview remains centred and transparent, and X restores the muted preview.
- Browser verification confirmed controls=null, one pause button, working pause, seeking to 12 seconds and return to preview. The real 25-second local asset played inside its frame. Actual iPhone/Safari fullscreen and audio handling still need a device check.

### Server request budgets

| Action | Budget |
| --- | --- |
| Email-existence checks | 5 per network per 10 minutes |
| New review submissions | 5 per network per 10 minutes, plus the existing CAPTCHA |
| Booking-intent capture | 5 per network per 10 minutes |
| Deletion-email requests | 5 per network per 10 minutes |
| Playbook recovery requests | 5 per network per 15 minutes; existing email/reference pair limit remains 3 per hour |
| OTP verification | 5 per network per 10 minutes; existing 5-guess cap per challenge remains |
| Invalid download-grant/reference attempts | 5 per network per 10 minutes |
| Preparing a new checkout | 5 per network per hour |
| Admin password guesses | 5 failed/in-flight attempts per network per 10 minutes, shared across the password-protected endpoints |

The server stores keyed network hashes in private limit records. Changing email, reference or local storage does not create a different network bucket. Existing verified downloads retain their separate broader budget, so the guess limit is not a new permanent purchase/download entitlement limit. A response-lost review retry with its verified private capability bypasses the new-submission allowance.

Admin authentication reserves a slot atomically before comparing credentials. Correct authentication releases its reservation; a wrong password retains it until the window expires. Concurrent attempts and cooldown reset are covered by PostgreSQL tests. All password-based admin routes use the same helper, including moderation, mail retries and assignments. Public clients cannot execute the private auth-budget RPCs. Security-database failures fail closed.

Cooldown responses use HTTP 429, explain the waiting period and include Retry-After. The frontend email check now retains its draft and stops progression when checking fails or is limited. Its duplicate-email copy directs the owner to the original device or recovery contact rather than suggesting another email.

The deletion-email lookup now escapes SQL ILIKE wildcards so literal underscores/percent signs in an email do not match another address. Raw Resend response bodies are no longer logged in that request path.

The admin overview includes a password-quality warning for short, common or repeated secrets. It recommends a unique randomly generated secret, does not expose the configured value and does not silently change or lock out the existing configuration. There is no public visitor password feature to reset; Haven's knowledge now says so explicitly.

Limits depend on the hosted gateway's trusted client-IP headers. Shared Wi-Fi/mobile networks can share a budget; a cooldown is not evidence of abusive conduct. These controls are not a substitute for protection against distributed traffic or individual staff identities/MFA. Moving the existing shared admin password to individual staff accounts with MFA remains a sensible future security upgrade, rather than pretending a length check establishes complete account security. See [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

### Gemini configuration clarification

The code reads GEMINI_ENABLED, GEMINI_API_KEY and GEMINI_MODEL; it does **not** read a payment-confirmation secret. Billing/tier is inherited from the Google project and linked billing account that own the API key. An extra Supabase secret alone does not enable Google billing or guarantee generation availability. See [Google's Gemini billing documentation](https://ai.google.dev/gemini-api/docs/billing/).

Use the existing admin provider diagnostic and a real saved chat after deployment. Metadata access alone does not establish that a generated reply succeeds. The existing transient retry/fallback remains in place.

### Additional live checks

9. In staging, try five email checks with different email addresses, then a sixth. Expect 429, the visible wait message and the same retained form. Do not spam real customer inboxes to test rate limits.
10. Test incorrect admin credentials five times on an isolated test network, including changing which password-protected endpoint is called. Expect a shared cooldown. Confirm valid use works after expiry and ordinary valid dashboard activity does not accumulate failures.
11. Use an approved buyer fixture for OTP recovery. Confirm guessing remains limited, fresh verified checkout opens directly without OTP, and future recovery is still available.
12. Test the video on iPhone: one play/pause control, seek backwards, mute, X, page scroll and supported fullscreen. Ask Haven about the free call and accept a Playbook recommendation; verify relevant wording rather than repetitive generic copy.

## Validation

- `node --test tests/*.test.mjs`: **402 passed, 0 failed, 0 skipped**. This includes the new endpoint, template, knowledge-injection and PostgreSQL migration checks.
- The PostgreSQL checks execute the actual new migration using PGlite: template cutover, target validation, inquiry ownership, revision conflicts, immutable payloads, email leases/retry expiry, revocation, per-booking state, public-role denial and cascading deletion.
- Deno checks passed for all 17 affected endpoints listed below and their shared imports.
- Production build passed. The existing main-bundle size warning remains (approximately 850 kB before gzip).
- New JavaScript files pass their focused checks, and changed JavaScript files introduce no additional lint diagnostics. The remaining pre-existing repository findings are recorded with the final status below.
- Browser QA: assignment selection, note editing, save/send separation and acceptance feedback worked in an isolated local fixture. At 390 px, page width and viewport width were both 390 px. The free class preparation message was also verified on the real local homepage.
- `git diff --check` passed; Git may print normal line-ending conversion notices.

The new development-only PGlite dependency makes the SQL regression test reproducible with `npm ci`. It does not add database runtime code to the public bundle.

## Deploy in this order

1. Apply these two migrations once, in order, after the existing migrations:
   - `supabase/migrations/20261028000000_team_assignments_and_booking_email.sql`: private assignments, immutable booking mail, version columns and RPCs.
   - `supabase/migrations/20261028000001_request_security.sql`: private atomic admin-auth reservations. It uses the limit table from the earlier recovery migration.
2. Verify existing `ADMIN_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` and verified sender configuration. Optionally set **TEAM_ASSIGNMENT_LINK_SECRET** to a stable long random server-only value; otherwise the function uses the service key. Changing the signing secret invalidates existing brief links.
3. Deploy these 17 functions to the correct project:

```powershell
supabase functions deploy haven-chat --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy send-tmh-booking-confirmation --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy calendly-webhook --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy calendly-poll-bookings --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy admin-fetch-leads --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy admin-update-lead --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy admin-team-assignment --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy read-team-assignment --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy admin-retry-purchase-email --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy flag-user --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy check-email-exists --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy create-brand-review --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy capture-booking-lead --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy request-data-deletion --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy request-playbook-recovery --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy verify-playbook-recovery --project-ref dkpoygkduktusrnsbpaq
supabase functions deploy verify-paystack --project-ref dkpoygkduktusrnsbpaq
```

The function configuration contains `verify_jwt=false` for the two new endpoints because they validate the admin password or signed capability themselves. Neither endpoint relies on a public anon key as authorization.

4. Publish the frontend after the functions. Existing Netlify/SPA redirects must continue to serve `/team-brief` correctly.
5. Add the real `VITE_FREE_CLASS_VIDEO_ID` when the class is ready, then rebuild the frontend. Until then, its preparation state is intentional.

No extra Cron job is needed for assignments: notifications are explicit admin actions. The existing optional purchase check-in still requires its earlier separate scheduler setup.

## What to test after deployment

1. Ask Haven where the class is, how to hear the About video, whether declining cookies blocks checkout, why ₦15,000 is crossed out, and what the optional check-in does. Expect specific answers and no invented availability/deadlines.
2. Book from each of the three service cards. Confirm the service name, source, time, status and TMH email state in Bookings. Calendly's email must contain the joining details.
3. Book after a brand review. Verify an available saved name and the modern confirmation. Make a second distinct appointment with the same email: it must get its own confirmation without duplicates from webhook/poller retries.
4. Assign an upcoming booking to a chosen teammate with an approved work inbox. Save first: no email. Send explicitly: correct recipient, service, time and preparation button. Provider acceptance is not a claim of inbox delivery.
5. Open its brief on a second device/private window without an admin login. Verify the limited data, then acknowledge it and reload the admin assignment details.
6. Replace the assignment or withdraw its link. The old email link must stop working. A cancelled meeting must show its current cancellation status.
7. Assign an anonymous Team Inquiry. It must remain anonymous, show the supplied preparation note and avoid inventing a meeting time or client email.
8. Check the notification error/retry workflow if Resend is temporarily unavailable. Never rotate a real key just to create a failure; use a staging fixture or an observed delivery failure.

## Remaining external inputs

Actual teammate inboxes are entered by the admin; none were invented or emailed during this task. The free class still needs its real video ID. Actual inbox delivery, live Calendly sync, provider availability and real iPhone keyboard behaviour require production/device checks and are not established by these local tests.

## Exact file inventory and Git output

The final inventory and outputs are appended below. Tracked diff statistics exclude new untracked files; the status lists both.

Repository ESLint: **44 errors, 2 warnings** remain. No new diagnostic was introduced in changed JavaScript files; the new JavaScript files pass their focused check. One existing unused import was removed.

| File | Change |
| --- | --- |
| [deno.lock](C:/Projects/tmh-platform/deno.lock) | Modified |
| [package-lock.json](C:/Projects/tmh-platform/package-lock.json) | Modified |
| [package.json](C:/Projects/tmh-platform/package.json) | Modified |
| [src/App.jsx](C:/Projects/tmh-platform/src/App.jsx) | Modified |
| [src/components/MasterclassBanner.jsx](C:/Projects/tmh-platform/src/components/MasterclassBanner.jsx) | Modified |
| [src/components/about/AboutStoryVideo.jsx](C:/Projects/tmh-platform/src/components/about/AboutStoryVideo.jsx) | Modified |
| [src/components/haven/components/chat/ChatMessage.jsx](C:/Projects/tmh-platform/src/components/haven/components/chat/ChatMessage.jsx) | Modified |
| [src/components/modals/BrandReviewModal.jsx](C:/Projects/tmh-platform/src/components/modals/BrandReviewModal.jsx) | Modified |
| [src/lib/tmhPublicInfo.js](C:/Projects/tmh-platform/src/lib/tmhPublicInfo.js) | Modified |
| [src/pages/AdminDashboard.jsx](C:/Projects/tmh-platform/src/pages/AdminDashboard.jsx) | Modified |
| [supabase/config.toml](C:/Projects/tmh-platform/supabase/config.toml) | Modified |
| [supabase/functions/_shared/calendly-bookings.ts](C:/Projects/tmh-platform/supabase/functions/_shared/calendly-bookings.ts) | Modified |
| [supabase/functions/_shared/email-template.js](C:/Projects/tmh-platform/supabase/functions/_shared/email-template.js) | Modified |
| [supabase/functions/_shared/haven-knowledge.js](C:/Projects/tmh-platform/supabase/functions/_shared/haven-knowledge.js) | Modified |
| [supabase/functions/_shared/haven-prompts.js](C:/Projects/tmh-platform/supabase/functions/_shared/haven-prompts.js) | Modified |
| [supabase/functions/_shared/haven-request.ts](C:/Projects/tmh-platform/supabase/functions/_shared/haven-request.ts) | Modified |
| [supabase/functions/_shared/haven-routing.js](C:/Projects/tmh-platform/supabase/functions/_shared/haven-routing.js) | Modified |
| [supabase/functions/_shared/playbook-recovery.ts](C:/Projects/tmh-platform/supabase/functions/_shared/playbook-recovery.ts) | Modified |
| [supabase/functions/admin-fetch-leads/index.ts](C:/Projects/tmh-platform/supabase/functions/admin-fetch-leads/index.ts) | Modified |
| [supabase/functions/admin-retry-purchase-email/index.ts](C:/Projects/tmh-platform/supabase/functions/admin-retry-purchase-email/index.ts) | Modified |
| [supabase/functions/admin-update-lead/index.ts](C:/Projects/tmh-platform/supabase/functions/admin-update-lead/index.ts) | Modified |
| [supabase/functions/calendly-poll-bookings/index.ts](C:/Projects/tmh-platform/supabase/functions/calendly-poll-bookings/index.ts) | Modified |
| [supabase/functions/calendly-webhook/index.ts](C:/Projects/tmh-platform/supabase/functions/calendly-webhook/index.ts) | Modified |
| [supabase/functions/capture-booking-lead/index.ts](C:/Projects/tmh-platform/supabase/functions/capture-booking-lead/index.ts) | Modified |
| [supabase/functions/check-email-exists/index.ts](C:/Projects/tmh-platform/supabase/functions/check-email-exists/index.ts) | Modified |
| [supabase/functions/create-brand-review/index.ts](C:/Projects/tmh-platform/supabase/functions/create-brand-review/index.ts) | Modified |
| [supabase/functions/flag-user/index.ts](C:/Projects/tmh-platform/supabase/functions/flag-user/index.ts) | Modified |
| [supabase/functions/request-data-deletion/index.ts](C:/Projects/tmh-platform/supabase/functions/request-data-deletion/index.ts) | Modified |
| [supabase/functions/request-playbook-recovery/index.ts](C:/Projects/tmh-platform/supabase/functions/request-playbook-recovery/index.ts) | Modified |
| [supabase/functions/send-tmh-booking-confirmation/index.ts](C:/Projects/tmh-platform/supabase/functions/send-tmh-booking-confirmation/index.ts) | Modified |
| [supabase/functions/verify-paystack/index.ts](C:/Projects/tmh-platform/supabase/functions/verify-paystack/index.ts) | Modified |
| [supabase/functions/verify-playbook-recovery/index.ts](C:/Projects/tmh-platform/supabase/functions/verify-playbook-recovery/index.ts) | Modified |
| [tests/about-video.test.mjs](C:/Projects/tmh-platform/tests/about-video.test.mjs) | Modified |
| [tests/admin-diagnostics.test.mjs](C:/Projects/tmh-platform/tests/admin-diagnostics.test.mjs) | Modified |
| [tests/admin-management.test.mjs](C:/Projects/tmh-platform/tests/admin-management.test.mjs) | Modified |
| [tests/admin-tabs.test.mjs](C:/Projects/tmh-platform/tests/admin-tabs.test.mjs) | Modified |
| [tests/backend-tasks.test.mjs](C:/Projects/tmh-platform/tests/backend-tasks.test.mjs) | Modified |
| [tests/email-lookup.test.mjs](C:/Projects/tmh-platform/tests/email-lookup.test.mjs) | Modified |
| [tests/legal-disclosures.test.mjs](C:/Projects/tmh-platform/tests/legal-disclosures.test.mjs) | Modified |
| [tests/paystack-purchases.test.mjs](C:/Projects/tmh-platform/tests/paystack-purchases.test.mjs) | Modified |
| [tests/review-security.test.mjs](C:/Projects/tmh-platform/tests/review-security.test.mjs) | Modified |
| [tests/user-flags.test.mjs](C:/Projects/tmh-platform/tests/user-flags.test.mjs) | Modified |
| [FINAL_KNOWLEDGE_EMAILS_REPORT_20261028.md](C:/Projects/tmh-platform/FINAL_KNOWLEDGE_EMAILS_REPORT_20261028.md) | New |
| [src/components/admin/TeamAssignment.jsx](C:/Projects/tmh-platform/src/components/admin/TeamAssignment.jsx) | New |
| [src/pages/TeamBriefPage.jsx](C:/Projects/tmh-platform/src/pages/TeamBriefPage.jsx) | New |
| [supabase/functions/_shared/abuse-limits.ts](C:/Projects/tmh-platform/supabase/functions/_shared/abuse-limits.ts) | New |
| [supabase/functions/_shared/admin-auth.ts](C:/Projects/tmh-platform/supabase/functions/_shared/admin-auth.ts) | New |
| [supabase/functions/_shared/team-assignment-public.js](C:/Projects/tmh-platform/supabase/functions/_shared/team-assignment-public.js) | New |
| [supabase/functions/_shared/team-assignment.js](C:/Projects/tmh-platform/supabase/functions/_shared/team-assignment.js) | New |
| [supabase/functions/admin-team-assignment/index.ts](C:/Projects/tmh-platform/supabase/functions/admin-team-assignment/index.ts) | New |
| [supabase/functions/read-team-assignment/index.ts](C:/Projects/tmh-platform/supabase/functions/read-team-assignment/index.ts) | New |
| [supabase/migrations/20261028000000_team_assignments_and_booking_email.sql](C:/Projects/tmh-platform/supabase/migrations/20261028000000_team_assignments_and_booking_email.sql) | New |
| [supabase/migrations/20261028000001_request_security.sql](C:/Projects/tmh-platform/supabase/migrations/20261028000001_request_security.sql) | New |
| [tests/final-knowledge-emails.test.mjs](C:/Projects/tmh-platform/tests/final-knowledge-emails.test.mjs) | New |
| [tests/helpers/security-fixture.mjs](C:/Projects/tmh-platform/tests/helpers/security-fixture.mjs) | New |
| [tests/request-security.test.mjs](C:/Projects/tmh-platform/tests/request-security.test.mjs) | New |
| [tests/team-assignment-sql.test.mjs](C:/Projects/tmh-platform/tests/team-assignment-sql.test.mjs) | New |

### git diff --stat

```text
 deno.lock                                          |  1 +
 package-lock.json                                  |  8 ++
 package.json                                       |  1 +
 src/App.jsx                                        |  2 +
 src/components/MasterclassBanner.jsx               | 15 ++--
 src/components/about/AboutStoryVideo.jsx           | 27 +++++--
 .../haven/components/chat/ChatMessage.jsx          |  2 +-
 src/components/modals/BrandReviewModal.jsx         |  9 ++-
 src/lib/tmhPublicInfo.js                           |  2 +-
 src/pages/AdminDashboard.jsx                       | 22 ++++--
 supabase/config.toml                               |  6 ++
 supabase/functions/_shared/calendly-bookings.ts    |  3 +
 supabase/functions/_shared/email-template.js       | 27 +++++++
 supabase/functions/_shared/haven-knowledge.js      | 63 ++++++++++++++++
 supabase/functions/_shared/haven-prompts.js        | 12 ++-
 supabase/functions/_shared/haven-request.ts        |  2 +-
 supabase/functions/_shared/haven-routing.js        | 27 ++++---
 supabase/functions/_shared/playbook-recovery.ts    |  2 +-
 supabase/functions/admin-fetch-leads/index.ts      | 15 ++--
 .../functions/admin-retry-purchase-email/index.ts  |  8 +-
 supabase/functions/admin-update-lead/index.ts      |  8 +-
 supabase/functions/calendly-poll-bookings/index.ts |  9 ++-
 supabase/functions/calendly-webhook/index.ts       |  5 +-
 supabase/functions/capture-booking-lead/index.ts   |  8 +-
 supabase/functions/check-email-exists/index.ts     | 10 ++-
 supabase/functions/create-brand-review/index.ts    |  4 +-
 supabase/functions/flag-user/index.ts              |  8 +-
 supabase/functions/request-data-deletion/index.ts  | 11 ++-
 .../functions/request-playbook-recovery/index.ts   |  3 +-
 .../send-tmh-booking-confirmation/index.ts         | 86 +++++++++++++---------
 supabase/functions/verify-paystack/index.ts        |  4 +-
 .../functions/verify-playbook-recovery/index.ts    |  3 +-
 tests/about-video.test.mjs                         | 16 +++-
 tests/admin-diagnostics.test.mjs                   |  4 +-
 tests/admin-management.test.mjs                    | 10 ++-
 tests/admin-tabs.test.mjs                          |  2 +-
 tests/backend-tasks.test.mjs                       | 20 ++++-
 tests/email-lookup.test.mjs                        |  7 +-
 tests/legal-disclosures.test.mjs                   |  9 ++-
 tests/paystack-purchases.test.mjs                  |  3 +-
 tests/review-security.test.mjs                     |  3 +-
 tests/user-flags.test.mjs                          |  5 +-
 42 files changed, 366 insertions(+), 126 deletions(-)
```

### git status

```text
On branch feat/final-knowledge-and-emails
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   deno.lock
	modified:   package-lock.json
	modified:   package.json
	modified:   src/App.jsx
	modified:   src/components/MasterclassBanner.jsx
	modified:   src/components/about/AboutStoryVideo.jsx
	modified:   src/components/haven/components/chat/ChatMessage.jsx
	modified:   src/components/modals/BrandReviewModal.jsx
	modified:   src/lib/tmhPublicInfo.js
	modified:   src/pages/AdminDashboard.jsx
	modified:   supabase/config.toml
	modified:   supabase/functions/_shared/calendly-bookings.ts
	modified:   supabase/functions/_shared/email-template.js
	modified:   supabase/functions/_shared/haven-knowledge.js
	modified:   supabase/functions/_shared/haven-prompts.js
	modified:   supabase/functions/_shared/haven-request.ts
	modified:   supabase/functions/_shared/haven-routing.js
	modified:   supabase/functions/_shared/playbook-recovery.ts
	modified:   supabase/functions/admin-fetch-leads/index.ts
	modified:   supabase/functions/admin-retry-purchase-email/index.ts
	modified:   supabase/functions/admin-update-lead/index.ts
	modified:   supabase/functions/calendly-poll-bookings/index.ts
	modified:   supabase/functions/calendly-webhook/index.ts
	modified:   supabase/functions/capture-booking-lead/index.ts
	modified:   supabase/functions/check-email-exists/index.ts
	modified:   supabase/functions/create-brand-review/index.ts
	modified:   supabase/functions/flag-user/index.ts
	modified:   supabase/functions/request-data-deletion/index.ts
	modified:   supabase/functions/request-playbook-recovery/index.ts
	modified:   supabase/functions/send-tmh-booking-confirmation/index.ts
	modified:   supabase/functions/verify-paystack/index.ts
	modified:   supabase/functions/verify-playbook-recovery/index.ts
	modified:   tests/about-video.test.mjs
	modified:   tests/admin-diagnostics.test.mjs
	modified:   tests/admin-management.test.mjs
	modified:   tests/admin-tabs.test.mjs
	modified:   tests/backend-tasks.test.mjs
	modified:   tests/email-lookup.test.mjs
	modified:   tests/legal-disclosures.test.mjs
	modified:   tests/paystack-purchases.test.mjs
	modified:   tests/review-security.test.mjs
	modified:   tests/user-flags.test.mjs

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	FINAL_KNOWLEDGE_EMAILS_REPORT_20261028.md
	src/components/admin/TeamAssignment.jsx
	src/pages/TeamBriefPage.jsx
	supabase/functions/_shared/abuse-limits.ts
	supabase/functions/_shared/admin-auth.ts
	supabase/functions/_shared/team-assignment-public.js
	supabase/functions/_shared/team-assignment.js
	supabase/functions/admin-team-assignment/
	supabase/functions/read-team-assignment/
	supabase/migrations/20261028000000_team_assignments_and_booking_email.sql
	supabase/migrations/20261028000001_request_security.sql
	tests/final-knowledge-emails.test.mjs
	tests/helpers/
	tests/request-security.test.mjs
	tests/team-assignment-sql.test.mjs

no changes added to commit (use "git add" and/or "git commit -a")
```

### Browser evidence

The following is an isolated local fixture, not a live client or a real email send.

![Assignment controls at phone width](C:/Projects/tmh-platform/node_modules/.cache/final-pass-assignment-mobile.png)

The actual local story player, paused after seeking to 12 seconds, with one custom play/pause control and no native controls overlay:

![Inline story playback controls](C:/Projects/tmh-platform/node_modules/.cache/final-pass-video-controls.png)

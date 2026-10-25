# TMH launch polish: 25 October 2026

**Local implementation complete on codex/bookings-playbook-and-drawer-polish, created from dev.** All changes are uncommitted. Nothing was pushed or deployed, no production SQL was run, and no real payment, email or provider mutation was performed during this work. This follows the earlier local-only instruction. Physical iPhone and deployed integration checks remain.

## What changed

### Haven drawer and restored transcripts

The supplied iPhone video showed the keyboard shrinking the visible drawer while the website beneath could still receive scrolling. The drawer now uses a portal outside the application root. The background becomes inert, the body and root are locked, and touch handling allows scrolling only within overlay elements that can scroll in the requested direction. Boundary drags cannot continue into the website. Pinch zoom is preserved. Closing restores previous styles and page position. The fixed shell follows visualViewport with coalesced updates.

This addresses a known Safari keyboard/scroll failure mode; overflow alone is insufficient on affected versions. [WebKit issue](https://bugs.webkit.org/show_bug.cgi?id=240860), [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport). Desktop viewport resizing cannot certify the real iPhone keyboard result.

The SQL regression shows a red restriction can be cleared and new messages appended to the same saved audit conversation without removing old history. A stale admin snapshot is a plausible explanation for your incident, not a proven production diagnosis. Admin now refreshes every 30 seconds while visible and on focus, invalidates transcript caches, and provides **Refresh transcript**. It avoids refreshing over active text entry. Partial lead updates prevent old whole-row snapshots from overwriting refreshed transcript metadata. Late overview responses cannot repopulate a logged-out dashboard.

Review ownership/access recovery is preserved: a browser missing its secure capability still cannot restore a review by email alone. Privacy/Terms content was not edited. Existing typing behavior and restriction UI remain.

### Playbook knowledge and purchase recovery

I read the 28-page supplied PDF and checked its contents and application pages. Concise server-only knowledge now reflects its nine actual chapters:

1. The Unseen Path
2. The Illusion of More
3. Strategy Is a Filter
4. The Hidden Drivers of Influence
5. The Shift From Knowing to Doing
6. The Brand Is You
7. Making It Real
8. Your Unseen Playbook
9. The Wrap Up and 24-Hour Action Plan

Haven can guide a verified reader through clarity, trust, friction and positioning using one relevant concept, one practical action and a useful follow-up. Reader guidance no longer automatically becomes another Playbook pitch or generic qualification loop. Call qualification still applies.

Detailed notes enter the provider prompt only after the server verifies a signed purchase capability. Public users receive high-level principles and purchase guidance. Saying “I bought it” is insufficient. Even buyers must not receive whole chapters, sequential reconstruction or a book replacement. Prompt restrictions reduce risk; they cannot guarantee an LLM never leaks or gives a weak answer.

Paystack verification now checks both reference and customer email before granting a download and a seven-day signed reader-guidance token. No private chapter notes were found in the production frontend JavaScript. Tokens contain no server secret/email and are not forwarded into provider prompts.

**Already purchased? Recover your copy** verifies checkout email/reference on a fresh device or after storage clearing, without charging again. Local paid state alone cannot unlock a download. Re-download obtains a fresh signed PDF URL; re-verifying renews reader guidance. New references use crypto.randomUUID(). Checkout also has Escape handling and focus trapping/restoration.

The card still shows **₦9,639 and struck-through ₦15,000**. The actual **live ₦100 test charge remains unchanged and disclosed**. Shop benefits and chapter groupings now match the book. “Download opened” avoids falsely claiming the file finished saving.

The token is a bearer capability, not an account. Refund revocation, offline sales and complimentary copies need a separate entitlement policy if introduced.

### Emails and retries

New purchase, team flag, customer warning/restriction and review welcome messages share a restrained HTML layout: dark masthead/button, readable type, generous spacing, escaped dynamic text and plain-text fallback.

The purchase email has **Access Your Playbook**, linking exactly to https://themarketinghaven.xyz/#shop, clear repeat-download instructions, the Paystack reference and “further guidance” instead of “further stuff.” It explains verification before asking Haven for reader guidance.

The welcome email has **Continue the review**. The App opens an owned review, or Support if ownership is unavailable; the email link never bypasses the secure capability. Copy reflects website/social/no-website submissions and does not claim scraping/scoring succeeded.

Team flag mail retains francis.teamhaven@gmail.com and paschal.tmh@gmail.com, with name when known, email when known, source, session/visitor, status, reason and an Admin button. Anonymous sessions are identified honestly. Customer flag emails have a team-contact action. No extra team purchase email was added.

The verified info@themarketinghaven.xyz sender default, working key configuration and shared Resend delivery helper were preserved. No key or DNS replacement was performed.

The migration versions purchase/flag templates. Existing pending records retain their exact legacy payload and idempotency key; new records use editorial-v1. An old retry can therefore retain old wording. This avoids changing a recent idempotent request into a Resend conflict or duplicate. [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).

Welcome delivery now requires internal authentication and reads recipient/name from the saved row, not caller-provided fields. It tracks attempts, safe errors and accepted provider IDs; a saved accepted ID allows marker repair without another send. The unused old onsite booking-email endpoint now returns 410, closing its caller-supplied recipient behavior. Current Calendly confirmations remain.

Provider acceptance is not inbox delivery. If the provider accepts, every database write fails before its ID is saved, and a retry occurs after the provider's deduplication window, operational review may still be needed.

### Bookings and admin

A new **Bookings** tab displays persisted Calendly bookings, unmatched direct bookings and historical onsite records. Cards show name/email, meeting, status, source, linked lead, start time, invitee timezone and last sync. Search, upcoming/status filters, 25-card pagination and a two-column laptop layout are included. The UI explicitly labels device timezone and its **500 loaded-record cap**.

The migration extends the existing bigint strategy_call_bookings table rather than replacing it. Historical identities/slot fields/Lagos times are preserved. Public insertion and sequence access are revoked; provider writes use a service-only RPC.

Poller and signed webhook persistence now run independently of email retry markers. Already-processed and unmatched invitees can still reach Admin. Cancellations persist and win over late active/created deliveries. Reschedules with new invitee URIs remain separate rows. Canceled records do not trigger confirmations. Existing poll retry/expiry rules are retained.

The webhook handles invitee.created and invitee.canceled. The setup script adds missing subscriptions only and requires the existing signing secret when extending an old subscription. [Calendly event documentation](https://developer.calendly.com/docs/api-guides/trigger-automations-with-other-apps-when-invitees-schedule-or-cancel-events).

The existing poll window remains meeting starts from three hours ago through 60 days ahead. This is not a full Calendly history import. Cancellations outside that window require the webhook for reliable synchronization. Calendly still supplies the team's normal meeting notifications; no duplicate team mail stream was added.

Booking-query errors do not blank other dashboard sections. Lead details include welcome-email status/diagnostics. Existing unified Brand Review / Support / Services transcript subtabs remain. Lead-delete copy now explicitly states purchases and booking history are retained and cancellations happen in Calendly; the privacy deletion flow itself was not rewritten.

### Images, motion and your clarification

A shared progressive image component reserves space, displays a skeleton/fallback, then uses a short blur/opacity reveal. Cached images skip placeholders; errors show a stable fallback. Team photos load early and small testimonial assets warm near the viewport, without eagerly downloading video. Person-modal images use the same treatment.

Carousel transitions crossfade with restrained movement, support swipe/drag and respect reduced motion. The actual review screenshot uses its landscape ratio and contain sizing so text is not clipped. Existing team portrait flip/hover behavior is retained. No dependencies were added.

**All three testimonial slots, their written-story panels, and play controls remain, including the About film control.** Pending material says coming soon. Stephanie already had pending copy in the starting code; replace it with her approved words when ready. Damilola's existing words/video and the real review screenshot remain. No fabricated quotation was added. Public photographs remain public.

## Validation

| Check | Result |
| --- | --- |
| node --test tests/*.test.mjs | 282 passed, 0 failed |
| Your exact three-file test command | 22 passed, 0 failed |
| Isolated real PostgreSQL/PGlite migration/security checks | 16 passed, 0 failed |
| Deno checks, all 11 changed edge functions | Passed |
| Production Vite build | Passed |
| Private chapter notes in built frontend JavaScript | 0 matches |
| git diff --check | Passed |
| Whole-repository ESLint | 52 errors, 2 warnings; matches the existing baseline |

No final unit or SQL check failed. The validation log contains the exact requested test output, full suite, SQL/type checks, build output, all ESLint diagnostics, and both requested Git outputs. Lint is not clean. The build still warns about the main chunk: **829.52 kB minified / 244.04 kB gzip**.

Browser checks used actual components with local mock responses at mobile, compact-height and laptop sizes. They covered drawer layout/portal/background lock/composer, recovery form and verified state, Bookings filters, refreshed transcripts, pending slides, light-theme person modal, missing-image fallback and HTML email. Temporary fixtures/tabs/server were removed/stopped.

These were Chromium checks, not Safari or real Gmail/Outlook. No live Supabase/provider/inbox/payment/iPhone pass is claimed.

## Deployment handoff: not performed

1. Confirm prior migrations through 20261024000001_haven_routing_state.sql are applied, including booking_intents and email-delivery diagnostics.
2. Manually apply these new SQL files once, in order:
   - [20261025000000_email_templates.sql](C:/Projects/tmh-platform/supabase/migrations/20261025000000_email_templates.sql)
   - [20261025000001_strategy_call_bookings.sql](C:/Projects/tmh-platform/supabase/migrations/20261025000001_strategy_call_bookings.sql)

   Do not rerun schema.sql over production; this migration supersedes its old anonymous booking insertion policy.
3. **Before deploying send-welcome-email**, inspect the brand_reviews INSERT Database Webhook. Send either Authorization: Bearer matching the server SUPABASE_SERVICE_ROLE_KEY or x-haven-internal-key matching that key. Configure privately; never expose it in frontend code/chat. An anon/public key now receives 401. If the webhook already uses the matching service credential, retain it. Gateway JWT verification is disabled for this handler in repository config because the handler enforces internal authentication, including modern secret-key support.
4. Deploy all 11 changed functions to **dkpoygkduktusrnsbpaq**, using repository config and their shared imports:
   - admin-fetch-leads
   - calendly-poll-bookings
   - calendly-webhook
   - haven-chat
   - verify-paystack
   - send-purchase-thankyou
   - send-welcome-email
   - send-flag-alert
   - send-flag-customer
   - send-tmh-booking-confirmation
   - send-booking-confirmation (deploy its tombstone to retire the old live endpoint)

   Example, repeated for each name:
   ~~~powershell
   npx supabase functions deploy admin-fetch-leads --project-ref dkpoygkduktusrnsbpaq
   ~~~
   Existing secrets stay server-side; no new token-signing secret is required.
5. Keep existing polling. Ensure Calendly subscribes to both created/canceled callbacks with its current signing secret. Review setup-calendly-webhook.mjs before running with private credentials; it was not executed live. The existing Paystack webhook URL stays unchanged.
6. After review/testing, deploy the frontend yourself and refresh devices. The checkout still takes real ₦100 test payments; changing to the actual launch charge is a separate deliberate step.

## Priority acceptance checklist

1. **Actual iPhone:** open Haven near page top/bottom, open/dismiss keyboard, type multiline, scroll chat to both ends, drag backdrop, switch scope and rotate. Background stays fixed, composer visible, chat scrollable; close restores page position. Test the browser used in the video.
2. **Restriction recovery:** red -> white -> Check access -> new messages in all three scopes. Refresh/reopen Admin subtabs and confirm both old and new history, including from a second admin window.
3. **Real ₦100 purchase after deployment:** one purchase and HTML thank-you, correct sender/reply-to, reference and Shop button. Download then recover on another device without payment. Wrong email/reference fails. Retry pending delivery; inspect saved provider ID/error. Check Gmail mobile/Outlook/dark mode.
4. **Flag notifications:** yellow/red/white transitions and failure/retry. Verify team identity/source/session details, no invented customer email, no duplicate flag event; red blocks input, white restores it.
5. **Bookings:** direct/review/Services booking, poll, duplicate webhook, cancel/reschedule. One row per invitee, canceled old row plus active replacement, preserved legacy history, no canceled confirmation; Calendly company notification remains.
6. **Book guidance:** verify in Shop, ask how clarity/trust/friction/positioning applies to a bakery. Expect a useful action rather than repeated pitch. Unverified chapter-dump requests do not get private notes. Test expiry/tampering/prompt extraction.
7. **Welcome/security:** website and no-website submissions; verify saved mail diagnostics. Same-browser continuation works; a new browser never inherits someone else's review. Anonymous welcome request returns 401; retired sender returns 410.
8. **Presentation:** cold-load both themes on slow connection, cycle all six testimonial slides, open full review/person modal and enable reduced motion. Keep pending play controls/third slot; add only approved future assets.

## Honest feedback: what still deserves attention

The site's length is adequate for explaining the offer and moving someone into review, services or purchase. Finished client stories and concrete outcomes will add more trust than another animation. Keep the restrained glass theme and small reveals rather than layering on effects.

Before calling launch fully proven, prioritize:
- Physical iPhone and deployed end-to-end checks above.
- A deliberate transition from ₦100 live testing to the launch charge.
- Individual admin authentication, MFA and action audit trails beyond the existing shared password. That architecture was not replaced here.
- Provider delivery/bounce monitoring, automatic failed-work handling, poll health and webhook failure alerts. Accepted mail is not necessarily delivered mail.
- Existing lint debt and measured bundle splitting on mid-range phones/slow connections.
- Server pagination and actual aggregate counts as volume grows; the capped loaded count is not lifetime total.
- Clear purchase/booking retention and refund/offline/complimentary access policies if those cases are supported.

Haven's knowledge and reader routing are improved, but response quality still depends on the configured model. Test awkward support/recovery questions, repeated requests and premature call requests. No prompt edit can establish that every future answer will be correct.

## Preview evidence

Local sample data only:
- [Laptop Bookings tab](C:/Users/HP/.codex/visualizations/2026/10/15/01a14147-e2a1-79f0-a9b1-a40129dc70f0/tmh-launch-polish-20261025/bookings-laptop.png)
- [Purchase email HTML on mobile](C:/Users/HP/.codex/visualizations/2026/10/15/01a14147-e2a1-79f0-a9b1-a40129dc70f0/tmh-launch-polish-20261025/purchase-email-mobile.png)
- [Compact drawer/composer](C:/Users/HP/.codex/visualizations/2026/10/15/01a14147-e2a1-79f0-a9b1-a40129dc70f0/tmh-launch-polish-20261025/drawer-compact.png)

## Exact changed files

- [LAUNCH_POLISH_20261025_REPORT.md](C:/Projects/tmh-platform/LAUNCH_POLISH_20261025_REPORT.md)
- [LAUNCH_POLISH_20261025_VALIDATION.txt](C:/Projects/tmh-platform/LAUNCH_POLISH_20261025_VALIDATION.txt)
- [scripts/check-final-migrations.mjs](C:/Projects/tmh-platform/scripts/check-final-migrations.mjs)
- [scripts/setup-calendly-webhook.mjs](C:/Projects/tmh-platform/scripts/setup-calendly-webhook.mjs)
- [src/App.jsx](C:/Projects/tmh-platform/src/App.jsx)
- [src/components/AboutSection.jsx](C:/Projects/tmh-platform/src/components/AboutSection.jsx)
- [src/components/ShopSection.jsx](C:/Projects/tmh-platform/src/components/ShopSection.jsx)
- [src/components/TestimonialsSection.jsx](C:/Projects/tmh-platform/src/components/TestimonialsSection.jsx)
- [src/components/about/AboutStoryVideo.jsx](C:/Projects/tmh-platform/src/components/about/AboutStoryVideo.jsx)
- [src/components/about/PersonModal.jsx](C:/Projects/tmh-platform/src/components/about/PersonModal.jsx)
- [src/components/haven/components/HavenDrawer.jsx](C:/Projects/tmh-platform/src/components/haven/components/HavenDrawer.jsx)
- [src/components/haven/context/HavenContext.jsx](C:/Projects/tmh-platform/src/components/haven/context/HavenContext.jsx)
- [src/components/haven/hooks/useDrawerViewport.js](C:/Projects/tmh-platform/src/components/haven/hooks/useDrawerViewport.js)
- [src/components/ui/ProgressiveImage.jsx](C:/Projects/tmh-platform/src/components/ui/ProgressiveImage.jsx)
- [src/pages/AdminDashboard.jsx](C:/Projects/tmh-platform/src/pages/AdminDashboard.jsx)
- [supabase/config.toml](C:/Projects/tmh-platform/supabase/config.toml)
- [supabase/functions/_shared/calendly-bookings.ts](C:/Projects/tmh-platform/supabase/functions/_shared/calendly-bookings.ts)
- [supabase/functions/_shared/email-template.js](C:/Projects/tmh-platform/supabase/functions/_shared/email-template.js)
- [supabase/functions/_shared/haven-prompts.js](C:/Projects/tmh-platform/supabase/functions/_shared/haven-prompts.js)
- [supabase/functions/_shared/haven-routing.js](C:/Projects/tmh-platform/supabase/functions/_shared/haven-routing.js)
- [supabase/functions/_shared/playbook-access.js](C:/Projects/tmh-platform/supabase/functions/_shared/playbook-access.js)
- [supabase/functions/admin-fetch-leads/index.ts](C:/Projects/tmh-platform/supabase/functions/admin-fetch-leads/index.ts)
- [supabase/functions/calendly-poll-bookings/index.ts](C:/Projects/tmh-platform/supabase/functions/calendly-poll-bookings/index.ts)
- [supabase/functions/calendly-webhook/index.ts](C:/Projects/tmh-platform/supabase/functions/calendly-webhook/index.ts)
- [supabase/functions/haven-chat/index.ts](C:/Projects/tmh-platform/supabase/functions/haven-chat/index.ts)
- [supabase/functions/send-booking-confirmation/index.ts](C:/Projects/tmh-platform/supabase/functions/send-booking-confirmation/index.ts)
- [supabase/functions/send-flag-alert/index.ts](C:/Projects/tmh-platform/supabase/functions/send-flag-alert/index.ts)
- [supabase/functions/send-flag-customer/index.ts](C:/Projects/tmh-platform/supabase/functions/send-flag-customer/index.ts)
- [supabase/functions/send-purchase-thankyou/index.ts](C:/Projects/tmh-platform/supabase/functions/send-purchase-thankyou/index.ts)
- [supabase/functions/send-tmh-booking-confirmation/index.ts](C:/Projects/tmh-platform/supabase/functions/send-tmh-booking-confirmation/index.ts)
- [supabase/functions/send-welcome-email/index.ts](C:/Projects/tmh-platform/supabase/functions/send-welcome-email/index.ts)
- [supabase/functions/verify-paystack/index.ts](C:/Projects/tmh-platform/supabase/functions/verify-paystack/index.ts)
- [supabase/migrations/20261025000000_email_templates.sql](C:/Projects/tmh-platform/supabase/migrations/20261025000000_email_templates.sql)
- [supabase/migrations/20261025000001_strategy_call_bookings.sql](C:/Projects/tmh-platform/supabase/migrations/20261025000001_strategy_call_bookings.sql)
- [tests/admin-flags-ui.test.mjs](C:/Projects/tmh-platform/tests/admin-flags-ui.test.mjs)
- [tests/admin-tabs.test.mjs](C:/Projects/tmh-platform/tests/admin-tabs.test.mjs)
- [tests/backend-tasks.test.mjs](C:/Projects/tmh-platform/tests/backend-tasks.test.mjs)
- [tests/calendly-polling.test.mjs](C:/Projects/tmh-platform/tests/calendly-polling.test.mjs)
- [tests/flag-alerts.test.mjs](C:/Projects/tmh-platform/tests/flag-alerts.test.mjs)
- [tests/haven-mobile-polish.test.mjs](C:/Projects/tmh-platform/tests/haven-mobile-polish.test.mjs)
- [tests/haven-server.test.mjs](C:/Projects/tmh-platform/tests/haven-server.test.mjs)
- [tests/paystack-purchases.test.mjs](C:/Projects/tmh-platform/tests/paystack-purchases.test.mjs)
- [tests/playbook-guidance.test.mjs](C:/Projects/tmh-platform/tests/playbook-guidance.test.mjs)
- [tests/playbook-ui.test.mjs](C:/Projects/tmh-platform/tests/playbook-ui.test.mjs)
- [tests/progressive-image.test.mjs](C:/Projects/tmh-platform/tests/progressive-image.test.mjs)
- [tests/welcome-editorial.test.mjs](C:/Projects/tmh-platform/tests/welcome-editorial.test.mjs)

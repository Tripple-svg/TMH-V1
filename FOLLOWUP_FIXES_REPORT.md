# TMH follow-up: iPhone drawer, email delivery and launch polish

Branch: `codex/ios-chat-and-delivery-fixes` (started from a clean `dev`).

The local changes are implemented and validated. Nothing was committed, pushed or deployed. Production migrations, backend deployment, real inbox delivery and an actual iPhone keyboard retest remain to be done. The production frontend has not been deployed.

## Email delivery: findings and changes

Your supplied SQL error (`42703: column error_message does not exist`) was a diagnostic-query error, not a Resend rejection. The actual purchase field is `thankyou_last_error`; there is no `attempt_count` field. You confirmed that the root domain `themarketinghaven.xyz` is Verified in Resend and that the sender is `info@themarketinghaven.xyz`. I preserved that default sender.

A real compatibility gap was reproduced using the installed Supabase SDK: with a modern `sb_secret_…` key and no signed-in session, an internal function invocation can omit Authorization. The old senders checked only a Bearer header and therefore rejected such calls before reaching Resend. Internal mail callers now explicitly send a server-only credential, and all three mail senders verify it against their server secret. Existing service-role Bearer calls still work. Public keys, forged tokens and ordinary users cannot send these emails. This is a verified code defect; the exact live incident cannot be attributed to it until the live invocation/error is checked.

The purchase sender and both flag senders now share a tested Resend delivery helper. It trims `RESEND_API_KEY`, validates the configurable sender (`RESEND_FROM_EMAIL`, optional), applies a 15-second provider timeout, and requires a valid provider email ID before marking success. It identifies invalid/restricted keys, unverified sender domains, test-recipient restrictions, quotas, rate limits and idempotency conflicts with safe diagnostic codes. Raw provider responses and credentials are never returned or logged.

Purchase retries retain the saved buyer/reference and stable provider idempotency key. Stored provider IDs repair an unsuccessful database status write without sending again. Already-sent purchases skip delivery. The webhook and admin retry preserve downstream authentication/boot/provider diagnostics rather than hiding them behind an unexplained Pending status. Resend acceptance is distinguished from actual inbox delivery.

Team and customer flag notifications have independent attempt timestamps, error fields and provider IDs. A failed channel does not suppress the other; both start independently. The duplicate `signal` property in the customer sender was removed. Team mail still goes to **francis.teamhaven@gmail.com** and **paschal.tmh@gmail.com**, with saved name when available, source, reason, session ID and visitor ID. Guest identity is never invented.

Admin now offers:

- **Check email setup** in Playbook Purchases: a read-only check using the deployed sender's account. A full-access key can confirm the exact verified sender domain. A sending-only key correctly reports that verification requires the Resend dashboard; it is not falsely labelled invalid or verified, and no permission expansion is needed.
- **Retry email** for existing pending purchases, with a visible delivery code.
- **Retry flag emails** in Leads: drains pending saved notifications without changing access status, reasons, or creating another flag event. Up to ten pending events are checked per request; repeat if more remain.

All seven changed edge functions pin the Supabase SDK to the version type-checked here (`2.118.0`). Existing gateway settings and application authentication/ownership checks remain in place.

## Haven conversation and mobile changes

The iPhone recording was inspected frame by frame. It shows vertical movement as Safari keyboard/browser chrome changes, with the page appearing below the drawer. The fix separates the untransformed fixed viewport shell from the sliding dialog. Viewport events are coalesced through animation frames without rerendering the whole drawer. The background page is locked at its saved scroll position and restored on close. Automatic message scrolling now targets the message pane instead of calling `scrollIntoView` on the document. Focus uses `preventScroll`; the composer retains 16px mobile text and now respects IME composition. Safe-area padding is retained.

New greetings and replies progressively reveal their text after a brief typing pause. Full replies are saved immediately; this is a presentation animation, not network token streaming. It is bounded in duration, isolated to the message component, cleaned up on unmount, and skipped for reduced motion. A bounded device ledger prevents replay when reopening a conversation. Old history remains immediate, chips wait for the reveal, and assistive technology receives the full message rather than repeated partial text. The reading/thinking indicator remains, and the scope dot has a subtle reduced-motion-aware pulse.

The repetitive bread-business flow had a server-state problem: diagnostic counts were saved, but the diagnosed need and recommendation permission were not. These are now committed atomically with each completed turn. Short follow-ups like “Please do” keep the diagnosis and advance to the appropriate explanation. The server asks permission without naming the Playbook, acknowledges a call request, and explains when a foundational issue needs a different first step. It continues to require the existing two-question/two-answer qualification before an offer. The migration preserves trusted in-progress permission states from before this upgrade.

Failed chat requests show a separate **Retry saved message** control instead of saving a network error as an assistant reply. Retries reuse the original turn ID and screenshot; a response-loss retry does not duplicate the user message or advance qualification twice. Rapid duplicate submissions are locked. Missing review access exits through normal cleanup rather than leaving the thinking indicator stuck.

Support also has concrete help for website navigation, missing purchase emails, lost review access and requests for another review. These help questions do not count as marketing diagnostic answers. Asking how to book a call is not mistaken for a Playbook navigation request. Broader conversational quality still depends on the selected model; the new state handling addresses an application bug independently of model choice.

**Saved-review security is preserved.** Only its explanation/help path was clarified. Missing local access keys never restore server access by a typed email, and the composer remains locked for an unverified saved review. Clearing all browser storage can lose device access keys and saved purchase references; it does not corrupt or delete the server's review or purchase records. Review/data deletion and browser-wide cache clearing remain separate actions.

## Visual changes

- Hero and header use a subtle dark glass border. The white review CTA has a restrained border/shadow and arrow movement.
- Mobile navigation has a translucent glass surface with a readable backing.
- About and Marketing Room play controls, team-modal role labels, team hover controls, and Cookie Banner acceptance use neutral zinc/white/black colors.
- Team-photo rings use dark contrast on light mode and light contrast on dark mode. Every modal avatar has a single front/back/front flip, including initials; reduced motion skips it. The modal also traps focus and restores it on close.
- Team biographies now describe their actual roles. The CTO biography focuses on technical direction and engineering rather than the preloader.
- The Playbook card retains price transparency: **₦9,639** beside a struck-through **₦15,000**. The existing live **₦100** charge remains unchanged. The cover gets a small hover/tap movement; no production animation dependency was added.
- Laptop leads use two roomy cards per row where space permits; the table is reserved for wide screens. Long leak descriptions wrap into readable paragraphs, with a wider leak column in the table. Expanded lead details and all three transcript scopes remain available.
- Testimonial lazy loading, privacy-policy content, purchase verification, and restriction enforcement were preserved. The browser-native microphone remains platform-dependent; no external transcription service was added.

## Validation

- `node --test tests/*.test.mjs`: **259 passed, 0 failed**.
- Requested command `node --test tests/backend-tasks.test.mjs tests/booking-ui.test.mjs tests/playbook-ui.test.mjs`: **19 passed, 0 failed**.
- Actual isolated PostgreSQL/PGlite migration and transaction checks: **13 passed, 0 failed**. Includes atomic diagnosis/permission persistence, retry idempotency, ownership/RLS, moderation and deletion/purchase separation.
- Deno type check: all **7 changed edge functions passed**, including their shared imports. The purchase sender now has explicit table types instead of an unresolved generic client type.
- Production build: **passed**. Main JS: **821.01 kB / 241.24 kB gzip**. Vite still reports its large-chunk warning.
- Lint comparison: existing `dev` baseline **52 errors / 2 warnings**; final **52 errors / 2 warnings**, with no increase from this patch. This patch is not a claim that repository-wide lint is clean.
- Browser checks: actual local frontend at 390×844 and a reduced-height 390×420 composer viewport; glass menu, team dialog, and laptop admin layout. Admin purchase/setup/flag retry checks used isolated fixture responses and sent no real emails. The fixture was removed afterward.
- `git diff --check`: passed. Full validation output, diff summary and status are in `FOLLOWUP_VALIDATION_OUTPUT.txt`.

A Windows Chromium viewport cannot reproduce iOS WebKit or its native keyboard. A real iPhone retest is still required before claiming the recorded glitch is resolved on hardware. Production Resend acceptance/delivery has not been observed from this workspace.

Local QA images:

- [Drawer at a reduced-height mobile viewport](C:/Projects/tmh-platform/node_modules/.cache/tmh-drawer-compact.png)
- [Laptop admin with fixture leads](C:/Projects/tmh-platform/node_modules/.cache/tmh-admin-laptop.png)
- [Team modal](C:/Projects/tmh-platform/node_modules/.cache/tmh-team-modal.png)

## Deployment order

1. In Supabase SQL Editor, apply these **two new migrations in order**, after the previously supplied migrations:
   - `supabase/migrations/20261024000000_email_delivery_diagnostics.sql`
   - `supabase/migrations/20261024000001_haven_routing_state.sql`
2. Deploy the three senders before their callers. From this branch/workspace, the following PowerShell performs only the required backend deployment:

```powershell
$tmhFollowupFunctions = @(
  'send-purchase-thankyou', 'send-flag-alert', 'send-flag-customer',
  'admin-retry-purchase-email', 'paystack-webhook', 'flag-user', 'haven-chat'
)
foreach ($tmhFollowupFunction in $tmhFollowupFunctions) {
  supabase.cmd functions deploy $tmhFollowupFunction --project-ref dkpoygkduktusrnsbpaq --no-verify-jwt
  if ($LASTEXITCODE -ne 0) { throw "Deployment failed: $tmhFollowupFunction" }
}
```

3. Keep `RESEND_API_KEY` server-only. The existing root-domain sender is the default; no new sender secret is required. If the deployed key belongs to another account or is restricted to a different sender domain, fix that account/key configuration using the new diagnostic. A verified domain alone does not prove the key belongs to that account or has its sending permission.
4. Test the backend and local frontend, then deploy the frontend through your normal process. No frontend deployment was performed here.

Correct diagnostic SQL (no `error_message` or `attempt_count`):

```sql
select reference, email, thankyou_sent, thankyou_sent_at,
       thankyou_attempted_at, thankyou_last_error, thankyou_email_id
from public.playbook_purchases
order by created_at desc limit 20;

select id, status, source, full_name, email, session_id, visitor_id,
       sent_at, team_attempted_at, team_last_error, team_email_id,
       customer_sent_at, customer_attempted_at,
       customer_last_error, customer_email_id
from public.flag_alert_notifications
order by created_at desc limit 20;
```

The About story still receives `videoSrc={null}` in the existing code. Its neutral play treatment does not attach a real video; the final story clip is still a content asset to supply.

## Test before launch

1. **Existing pending purchase, without paying again:** check email setup, retry the saved purchase, and confirm the row becomes Sent with a provider ID. Trace that ID in Resend and confirm inbox/spam delivery. Retry once more: no second email should be created. The account setup check itself sends no email.
2. **Existing flag notifications:** use Retry flag emails, check both team inboxes, and inspect saved team/customer delivery fields. Restriction status must stay unchanged. Test a disposable known lead and a guest Support/Services session: name appears only if known; source and IDs must identify the correct conversation. A failed customer notification must not block the team notification or remove the restriction.
3. **Real iPhone:** open each Haven scope, focus the composer, type several lines, hide/show the keyboard, scroll old messages, rotate the phone, and close/reopen the drawer. The composer should remain above the keyboard and the page should return to its prior position. The greeting should reveal once, not on every reopen.
4. **Bread scenario:** describe the factory and posting problem, answer the follow-up, then agree to hear the recommendation. No early Playbook pitch; no repeated diagnostic after “Please do.” Ask for a call after a foundational diagnosis and confirm the response acknowledges that request and explains the fit. Repeat after deliberately interrupting connectivity using Retry saved message.
5. **Support and access:** ask where the Playbook/services are, report a missing purchase email, ask for another review, and reopen a review without its access key. Verify direct help, preserved ownership protection and no fake account-action claims. Test red restriction and explicit admin clearing as before.
6. **Visual/accessibility:** light/dark team rings and roles, one avatar flip, reduced motion, mobile menu focus/Escape, neutral cookie acceptance, card/checkout prices, unchanged ₦100 live charge and existing testimonial loading.

Gemini remains disabled until paid billing is confirmed. Google documents billing at the API key's **project** level. After that project is on the appropriate paid tier, use its `GEMINI_API_KEY` and set `GEMINI_BILLING_CONFIRMED=true` in Supabase. The existing model default is `gemini-3.8-flash` (or set `GEMINI_MODEL` explicitly). Do not enable the billing-confirmed flag merely because a payment method or a different Google project was configured.

References used for the implementation: [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport), [Resend errors](https://resend.com/docs/api-reference/errors), [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Resend domain listing](https://resend.com/docs/api-reference/domains/list-domains), [Gemini billing](https://ai.google.dev/gemini-api/docs/billing), [Gemini models](https://ai.google.dev/gemini-api/docs/models?hl=en). The internal-auth finding was reproduced against the installed Supabase SDK, not inferred solely from documentation.

## Files changed

- [scripts/check-final-migrations.mjs](C:/Projects/tmh-platform/scripts/check-final-migrations.mjs)
- [src/components/AboutSection.jsx](C:/Projects/tmh-platform/src/components/AboutSection.jsx)
- [src/components/CookieBanner.jsx](C:/Projects/tmh-platform/src/components/CookieBanner.jsx)
- [src/components/HeroSection.jsx](C:/Projects/tmh-platform/src/components/HeroSection.jsx)
- [src/components/MasterclassBanner.jsx](C:/Projects/tmh-platform/src/components/MasterclassBanner.jsx)
- [src/components/ShopSection.jsx](C:/Projects/tmh-platform/src/components/ShopSection.jsx)
- [src/components/about/AboutStoryVideo.jsx](C:/Projects/tmh-platform/src/components/about/AboutStoryVideo.jsx)
- [src/components/about/PersonModal.jsx](C:/Projects/tmh-platform/src/components/about/PersonModal.jsx)
- [src/components/haven/components/HavenDrawer.jsx](C:/Projects/tmh-platform/src/components/haven/components/HavenDrawer.jsx)
- [src/components/haven/components/chat/ChatInput.jsx](C:/Projects/tmh-platform/src/components/haven/components/chat/ChatInput.jsx)
- [src/components/haven/components/chat/ChatMessage.jsx](C:/Projects/tmh-platform/src/components/haven/components/chat/ChatMessage.jsx)
- [src/components/haven/context/HavenContext.jsx](C:/Projects/tmh-platform/src/components/haven/context/HavenContext.jsx)
- [src/components/haven/hooks/useDrawerViewport.js](C:/Projects/tmh-platform/src/components/haven/hooks/useDrawerViewport.js)
- [src/components/haven/hooks/useTypingReveal.js](C:/Projects/tmh-platform/src/components/haven/hooks/useTypingReveal.js)
- [src/components/layout/Header.jsx](C:/Projects/tmh-platform/src/components/layout/Header.jsx)
- [src/pages/AdminDashboard.jsx](C:/Projects/tmh-platform/src/pages/AdminDashboard.jsx)
- [supabase/functions/_shared/haven-moderation.ts](C:/Projects/tmh-platform/supabase/functions/_shared/haven-moderation.ts)
- [supabase/functions/_shared/haven-prompts.js](C:/Projects/tmh-platform/supabase/functions/_shared/haven-prompts.js)
- [supabase/functions/_shared/haven-routing.js](C:/Projects/tmh-platform/supabase/functions/_shared/haven-routing.js)
- [supabase/functions/_shared/internal-auth.js](C:/Projects/tmh-platform/supabase/functions/_shared/internal-auth.js)
- [supabase/functions/_shared/resend-delivery.js](C:/Projects/tmh-platform/supabase/functions/_shared/resend-delivery.js)
- [supabase/functions/admin-retry-purchase-email/index.ts](C:/Projects/tmh-platform/supabase/functions/admin-retry-purchase-email/index.ts)
- [supabase/functions/flag-user/index.ts](C:/Projects/tmh-platform/supabase/functions/flag-user/index.ts)
- [supabase/functions/haven-chat/index.ts](C:/Projects/tmh-platform/supabase/functions/haven-chat/index.ts)
- [supabase/functions/paystack-webhook/index.ts](C:/Projects/tmh-platform/supabase/functions/paystack-webhook/index.ts)
- [supabase/functions/send-flag-alert/index.ts](C:/Projects/tmh-platform/supabase/functions/send-flag-alert/index.ts)
- [supabase/functions/send-flag-customer/index.ts](C:/Projects/tmh-platform/supabase/functions/send-flag-customer/index.ts)
- [supabase/functions/send-purchase-thankyou/index.ts](C:/Projects/tmh-platform/supabase/functions/send-purchase-thankyou/index.ts)
- [supabase/migrations/20261024000000_email_delivery_diagnostics.sql](C:/Projects/tmh-platform/supabase/migrations/20261024000000_email_delivery_diagnostics.sql)
- [supabase/migrations/20261024000001_haven_routing_state.sql](C:/Projects/tmh-platform/supabase/migrations/20261024000001_haven_routing_state.sql)
- [tests/email-delivery-diagnostics.test.mjs](C:/Projects/tmh-platform/tests/email-delivery-diagnostics.test.mjs)
- [tests/flag-alerts.test.mjs](C:/Projects/tmh-platform/tests/flag-alerts.test.mjs)
- [tests/haven-flags-scraper.test.mjs](C:/Projects/tmh-platform/tests/haven-flags-scraper.test.mjs)
- [tests/haven-mobile-polish.test.mjs](C:/Projects/tmh-platform/tests/haven-mobile-polish.test.mjs)
- [tests/haven-routing.test.mjs](C:/Projects/tmh-platform/tests/haven-routing.test.mjs)
- [tests/internal-email-auth.test.mjs](C:/Projects/tmh-platform/tests/internal-email-auth.test.mjs)
- [tests/paystack-purchases.test.mjs](C:/Projects/tmh-platform/tests/paystack-purchases.test.mjs)
- [tests/user-flags.test.mjs](C:/Projects/tmh-platform/tests/user-flags.test.mjs)

Also added: this report and `FOLLOWUP_VALIDATION_OUTPUT.txt`.

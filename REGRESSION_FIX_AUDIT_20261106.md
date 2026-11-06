# TMH regression correction and launch audit

Date: 6 November 2026. Base: `dev` at `1a23048`. Review branch: `codex/fix-launch-regressions`.

The previous pass was already on dev when this task started. The intro timeout, Data Saver skip, top progress indicator and widespread tap scaling were still present. The Support page used an after-paint effect. MFA enrollment did not refresh and remove incomplete TOTP setups. Haven had no concrete buttons for several website help destinations or owner review corrections.

This report covers the corrected release candidate and bounded checks of the existing live site. The changes in this branch have not been merged or deployed. Current production still serves `/assets/index-B0L0On3T.js` and the earlier Support wording. Photos, final video links and the free-class YouTube ID remain owner-deferred.

## 1. Critical bugs and corrected flows

| Priority | Finding and correction | Evidence and remaining limit |
| --- | --- | --- |
| P1 | Restored the previous complete cinematic intro. Removed the 1.8-second timer and Data Saver/reduced-motion bypass. The existing playback speed is 2.25x; completion comes from the video ending, followed by the existing 0.8-second fade. Actual playback failures can still release the visitor. | Local browser observation showed a 10.005-second media duration, 2.25x playback and a visible intro after the former cutoff. It disappeared after playback finished. Tests cover completion, no timer, Data Saver and media errors. Device/network stalls were not simulated by prematurely ending the intro. |
| P1 | Removed `PageProgress` and non-chip `whileTap` scaling from buttons, cards, forms and modals. Preserved existing section/drawer transitions and optional tap feedback on Haven chips. | Source scan found tap scaling only in Haven quick prompts/chat chips. The progress component and its scroll-driven work are removed. No replacement scroll widget was added. |
| P1 | MFA enrollment now verifies the admin, refreshes the session, confirms the same account, reads current factors, removes only unverified TOTP factors, then enrolls. | Tests prove verified factors and other factor types are not auto-deleted. Failed refresh, missing session, changed account, failed cleanup and AAL1 with an enabled factor cannot continue. This has not enrolled an actual production authenticator for Francis. |
| P1 | MFA failures retain safe provider codes and the operation/status in console diagnostics. Messages give specific next steps for disabled enrollment/verification, expired sessions, verification errors and changing networks. | Provider messages, tokens, QR secrets and codes are excluded from diagnostics. The historical generic mobile error alone does not prove its root cause. The next actual failure should identify its exact stage/code. |
| P1 | Added explicit owner review edits and a separately confirmed restart. Uses the existing capability-protected endpoint and a new service-only SQL function. Email remains unchanged. | Real PostgreSQL/Edge tests cover wrong capabilities, guessed IDs, input bounds, stale revisions, active replies, restrictions, RPC grants and preserved access. The new migration must precede deployment of the updated handler/UI. |
| P1 | A restart clears the saved audit conversation and derived diagnosis. Both corrections and restarts clear outdated memory/routing and invalidate old reply caches. Legacy browser snapshots cannot restore the cleared conversation. | Tested with a stale browser snapshot after restart. Other review records, support history, moderation, shared rate buckets and review access are preserved. Purchases/bookings are not modified by this function. Browser copies on other devices are separate from server history. |

No critical security failure was reproduced in the exercised live paths. This is bounded application testing, not proof that the platform is impenetrable.

MFA reference: Supabase distinguishes enrollment from verification; enrollment starts with an unverified factor. See the [enrollment reference](https://supabase.com/docs/reference/javascript/auth-mfa-enroll) and [Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes). The error code must determine the remedy; an incomplete factor is only one possible cause.

## 2. UX improvements

- Support uses a layout effect to position and focus its heading before paint. A local footer-to-Support navigation arrived at `scrollY=0` with the heading focused. This avoids visibly scrolling through the page from its previous footer position.
- Support now offers optional Haven help for directions and marketing questions. The team form remains directly available. Opening Haven does not send the form or its contents. Payment checks, refunds, account access and appeals still have a human route.
- Haven has allowlisted navigation buttons for the footer, Support, data export, data deletion, public team information and the review editor. They open pages/forms; they do not submit requests, delete data, reset limits or execute arbitrary model instructions. The footer chip was observed closing Haven and focusing the footer. The deletion chip opened the request form without submitting it.
- The review editor has a separate restart explanation and confirmation, a clear back action, disabled sending while editing, and preserved inputs plus Support after a failed save.
- The admin guide remains, with simpler wording for email acceptance, AI calls/tokens, lead status, approvals and daily work. Dark cards are slightly brighter with clearer borders. Existing tabs, table/card breakpoints and operational sections were retained.
- The guide was checked using synthetic UI data at phone width and desktop width. The phone view fit without document-wide horizontal overflow. This is not a substitute for an authenticated, physical-iPhone Safari check of every Admin panel.
- Cookie wording, ordinary 44px minimum buttons and explicit analytics labels remain. No oversized replacement controls were introduced.
- The microphone remains. The current implementation uses browser speech recognition, not an AssemblyAI integration. Support varies by browser; typing remains available. No new transcription service was purchased or added.

Performance limit: production build succeeds but still reports a large main entry chunk, about 851 kB minified and 250 kB gzip locally. Removing the scroll indicator and widespread tap transforms addresses the requested regressions. These checks do not prove frame rate or loading performance on a low-end physical phone. Keep future visual changes restrained and measure before adding more animation.

## 3. Haven quality and booking logic

Haven's prompt now explicitly requires understanding before naming a cause. Low sales or engagement can involve audience, price, offer, proof, delivery or ordering friction. Views alone establish none of these. The WhatsApp wording is an example of curiosity, not a mandatory script. Even an answer that videos only entertain supports a missing buying reason, not an automatic Trust leak. Haven can ask another relevant question when needed and should use facts already supplied. There is no fixed one/two-question quota.

The existing distinction between learning a relevant foundation and delegating operational/research work remains. Direct useful help is allowed; an unsolicited paid-resource recommendation needs a supported fit and permission. Website errors do not become sales pitches. Current saved profile/source/evidence override older chat details. Screenshot/reader limitations remain evidence limitations, not fabricated findings or forecasts. Existing moderation, privacy boundaries and server-controlled budgets remain active.

The updated server was tested to provide real website navigation chips in audit, service and support scopes without calling a paid model. This proves the application path, not the quality of an unrestricted model conversation. No funded live multi-turn evaluation was performed in this pass. Gemini `gemini-3.8-flash` is the configured default; provider account access, quota and actual response quality still need a rehearsal.

Booking behavior retained and covered by the full suite:

- Reservation/booking guards bind email, verified review and private visitor identity across entry points.
- A confirmed active meeting blocks another reservation through its recorded end time. A passed end time allows another reservation. This tracks the scheduled window, not proof that someone attended.
- Cancellations recorded by the Calendly poller/webhook release the guard and clear the lead booking badge. A delayed active event cannot resurrect a cancellation.
- Haven receives server-verified current booking/Playbook context when the conversation is linked. It cannot identify an unrelated browser or a different email with no verified link.
- Direct use of an external public Calendly link is outside the website's identity gate. Real webhook signing configuration and a booking/cancellation rehearsal remain useful release checks.

## 4. Live observations and missing release checks

Bounded live checks ran on 6 November 2026. No purchase, booking, customer-data deletion, support email or production MFA change was performed.

| Check | Observed result | Meaning |
| --- | --- | --- |
| `/`, `/support`, `/data-access`, `/privacy`, `/terms` | HTTP 200 with SPA document | Routes are reachable; individual forms were not submitted. |
| `/health` and direct Edge health | HTTP 200 JSON, `ok:true` | Database, RPC, Vault, cron and workers passed. The old HTML-response issue is resolved on the deployed site. |
| Required health configuration | Mail, payments, captcha, AI and Calendly all true | Presence checks, not provider delivery, payment or AI quality tests. Health explicitly reports `providerAvailability: not_probed`. |
| Optional health configuration | Error tracking true; city estimates true; calendar webhook false | Finish the Calendly signing-secret/subscription setup if using signed webhook delivery. Polling remains a separate path. |
| Anonymous `haven_sessions` and `brand_reviews` reads | HEAD count `*/0` | No rows were exposed to the anonymous role by these checks. |
| Anonymous review-capability table | HTTP 401 | Public access to capability records was denied. |
| Invented review credentials against correction handler | HTTP 403 | No correction reached the mutation path. |
| Invalid audit-access request against live Haven | HTTP 400 | Rejected; no model call or saved customer change was requested. This is validation evidence, not a successful authenticated flow. |
| Deployed public entry bundle | Sentry DSN pattern detected | Browser configuration is present. No DSN value was printed. A controlled new error/delivery test was not performed. |
| Deployed Playbook modal | Price, PDF format, no subscription, existing-purchase recovery, licence/refund policy and optional check-in disclosed | Checkout explanation is clear. No Paystack charge or receipt/download recovery was exercised live in this pass. |

Sentry note: an “Edge operation failed” notification is evidence of a captured application failure, not by itself an SDK integration failure. Current code includes function, status and request tags while minimizing personal data. The exact historical issue still needs those tags to establish cause. A 503 alone does not prove unpaid billing. Production frontend Sentry uses `VITE_SENTRY_DSN` from the Netlify build environment; local `.env` is needed only for local testing. Edge Sentry uses the Supabase `SENTRY_DSN` secret separately.

Security limit: network rate buckets ignore caller-supplied `X-Forwarded-For`/`X-Real-IP` and use the ingress address or a shared conservative fallback. Correct deployment still depends on ingress overwriting `cf-connecting-ip`; this pass did not independently prove that edge configuration. Global provider budgets and verified review/visitor limits remain additional controls.

Release order:

1. Review this branch and reconcile the live migration catalog/ledger before applying anything. The previous audit found historical ledger drift. Do not replay all historical migrations blindly.
2. Apply only the reviewed new `20261106000000_owned_review_revision.sql` delta against its required existing schema, deploy `update-review-source` and `haven-chat` with their shared files, then publish the matching frontend. Keep versions together.
3. On Francis's real phone, test Add authenticator, QR scan/manual key, current code, sign-out/sign-in challenge and safely stored backup codes. If it fails, use the safe code/operation now shown. Do not remove verified factors to force enrollment.
4. With provider billing/access ready, run multi-turn cases for vague low sales, missing brand presence, a genuine operational rebuild and an existing customer asking for recovery. Check understanding, evidence, route fit and quota/outage recovery.
5. Rehearse one complete payment/receipt/download/recovery flow and one booking/cancellation flow in an agreed test environment. Confirm production monitor contacts and a downtime/recovery alert. This pass did not access UptimeRobot account settings or perform real production transactions.
6. Add the owner-deferred photos/videos/YouTube ID, then check the final visual content and links on a real phone.

## 5. Test evidence and scores

| Validation | Result |
| --- | --- |
| Full suite | 616 passed, 0 failed |
| Separate existing security command | 13 passed, 0 failed; also included in the full suite |
| ESLint | Passed after removing the temporary isolated browser fixture |
| Production build | Passed; main-chunk size warning retained above |
| Deno checks | All 45 Edge entry points passed |
| npm audit | 0 vulnerabilities reported |
| Isolated load test | 10 visitors, 10 replies, 0 errors/timeouts/non-2xx responses; stub provider; p99 about 1.65 seconds |
| Isolated restore | Passed synthetic PostgreSQL catalog/data/RLS/admin-RPC checks; not a production backup or storage-object-byte restore |
| Browser checks | Full intro/cutoff/fade, Support top/focus, mobile overflow, guide contrast, navigation, deletion form opening and explicit restart confirmation |

Scores assess the reviewed release candidate and observed scope, not an assurance about every possible attack or device. The current live site has not received this branch yet.

| Category | Score | Why and final barrier to a higher score |
| --- | --- | --- |
| Security & Privacy | 8.5/10 | Strong exercised ownership, roles, MFA, budgets, restart and privacy controls. Release deployment, real MFA recovery, ingress verification, provider privacy settings and independent penetration testing remain. No impenetrability claim. |
| UI/UX & Accessibility | 8.2/10 | Full intro restored, touch scaling removed, Support entry corrected, guide clearer, navigation controls usable. Large bundle, physical low-end/Safari testing and final owner media still limit confidence. |
| AI Quality & Personality | 8.0/10, provisional | Better evidence discipline, natural questioning, route fit and actual website navigation. This is a prompt/system assessment. Paid Gemini conversation quality, latency and consistency have not been demonstrated. |
| Business & Conversion | 8.5/10 | Clear price/licence/recovery guidance, existing server payment verification and booking guards, explicit human support. End-to-end paid delivery and external calendar rehearsal remain. |

Suggested next improvements are measured work: a short representative Haven evaluation set, performance measurements on a modest phone, and a documented operational rehearsal for recovery. Another broad animation/features pass is not needed to resolve this regression.

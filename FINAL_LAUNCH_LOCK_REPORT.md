# TMH final launch lock: implementation and audit

Audit date: 5 November 2026. Branch: `feat/final-launch-lock`. Starting point: `051a6ec` on dev.

This report distinguishes the tested branch from the current public deployment. The branch is intended for review and release without merging to dev during this task. No production migrations, Edge deployments, payments, appointments, customer emails or destructive customer actions were performed by this pass. Four labelled synthetic guest chats were submitted to the existing live Haven deployment. Earlier reports remain historical records; this report supersedes their release status and affected-function counts.

## What was incomplete when this run resumed

The prior implementation still needed a durable anonymous-policy removal migration and consolidated baseline, actionable MFA diagnostics, visible booking errors for returning users, stable browser recognition, a public health proxy, a readable export, clearer admin budgets/rate limits, genuine payment retries, the current email footer, and a final accessibility/recovery pass. Those changes, the three new cookie/touch/personality tasks, the simple admin introduction, connected Haven context, payment/download review, privacy updates and restrained motion are implemented on this branch.

The release still needs a controlled deployment and external acceptance checks. Configuration presence does not establish provider capacity, inbox delivery or legal compliance. Free-class video, unfinished portraits and other media/content decisions were deliberately deferred at Francis's request.

## 1. CRITICAL BUGS

| Priority | Finding | Resolution and evidence | Remaining action |
| --- | --- | --- | --- |
| P0 | A legacy `anon_select_sessions` policy exposed saved conversation rows to the public API. Initial HEAD-only testing showed 26 visible rows. No conversation bodies were retrieved. | Francis removed the production policy. Recheck returned HTTP 200 and `Content-Range: */0`. Migration `20261105000000_remove_anon_select.sql` removes it durably. The regression test recreates the exposure in isolated SQL, applies the exact migration, verifies zero anonymous rows and preserves private records. | Owner should investigate historical access and assess privacy-incident obligations with appropriate advice. This audit does not establish whether anyone accessed the exposed records. |
| P1 | Forwarded-header fallback could let callers rotate network budget identities where ingress did not supply the preferred address. | Shared address parsing now accepts a validated Cloudflare ingress address, ignores `X-Forwarded-For`/`X-Real-IP`, canonicalizes IPv6, and shares one conservative bucket on missing/invalid input. Rotation regression passes. Visitor, review and global AI budgets remain enforced. | Verify the production gateway overwrites `CF-Connecting-IP` and prevents direct-origin access. Live forged-address probes were blocked upstream, so they do not prove the function-level ingress contract. |
| P1 | Closing a payment window claimed payment had not gone through. Callback loss could discard the checkout proof. Rapid clicks could overlap checkout. | Receipt capability is saved before Paystack opens. Close, timeout and script/setup failures lead to checking that receipt, with no claim about an unknown bank debit. Synchronous locks serialize checkout, verification and download requests. A return to checkout is offered only after a verified `failed`/`abandoned` result and the user's explicit no-debit choice. Pending/unknown/reversed statuses do not invite another payment. | Owner should complete one controlled provider payment, interrupted callback, recovery and remedy rehearsal. No real charge was made by the agent. |
| P1 | A public checkout-email lookup disclosed whether an address appeared in the buyer ledger. | Checkout preparation no longer queries that ledger. Every visitor gets the same recovery guidance and a newly generated reference. Email/reference alone never unlock an existing receipt or PDF. Regression rejects any purchase-ledger lookup during public preparation. | Keep ownership verification separate from contact details. The existing public review-availability check remains a deliberately limited eligibility response, with network limits; it never returns private review content. |
| P1 | Current Sentry browser SDK does not use the old `sendDefaultPii` flag as its data-collection control. Generic Edge alerts were difficult to investigate. | Explicit `dataCollection` settings disable identities, cookies, headers/bodies, query values, AI/MCP content, database payloads, local variables and context lines. A test instantiates the installed SDK and confirms IP inference is `never`. Edge reports keep only safe function/status/request tags, suppress IP inference in pinned SDK metadata, and group/title failures by function/status. | Enable Sentry's project-level IP-storage prevention as an additional safeguard. Verify a fresh deployed event, not an old alert. Historical events are not changed by source edits. |
| P1 | MFA setup hid useful Auth failures behind a generic authenticator error. | Enrollment, factor/assurance lookup, challenge, verification and removal retain safe error codes and operation stages. Expired sessions, duplicate/incomplete setup, disabled enrollment, rate limits and network errors get actionable guidance. Operations are locked against duplicate taps. Existing fresh Auth, current-admin and AAL2 checks remain fail-closed. | Complete an actual authenticator enrollment/challenge/backup-code rehearsal on mobile. An incomplete factor is not verified MFA; the exact historical mobile failure cannot be proven from source alone. |

Authorization testing covers guessed review/session IDs, cross-visitor proofs, forged roles/JWTs, stale or demoted admins, MFA/session revocation, purchase proof and OTP replay, webhook HMAC/body limits, SSRF, prompt injection, SQL concurrency, token budgets and two-admin deletion. These checks do not establish that any system is impenetrable.

Lead deletion was exercised against isolated real SQL and actual handlers/UI: cancelling sends nothing; requesting deletion keeps the lead; the requester cannot self-approve; a different current admin must approve the unchanged record within the allowed period; failed/revoked authorization prevents mutation. No live lead was deleted.

## 2. UX IMPROVEMENTS

- **Cookie controls:** exact requested plain-language copy, equal Accept/Decline choices, descriptive aria labels and approximately 45px touch heights at 390px width. The banner is a non-modal region and does not cover menus or dialogs.
- **Admin introduction:** a new **Start here** section explains TMH, Haven, reviews, the PDF purchase and free calls; gives a four-step daily routine; links to all ten work areas; and explains approvals, mail acceptance, refunds/cancellations and safe handling of customer data in ordinary language.
- **Admin clarity:** restrained panel/header styling, improved dim-text contrast, 44px mobile controls, 16px mobile inputs, comma-formatted budget values, calls-versus-tokens explanations and readable rate-limit descriptions instead of hashes.
- **Recovery:** returning review users see booking errors; failed payment verification has a working retry; expired data-export links offer a fresh request; rate-limit/provider messages retain waiting guidance and support paths. Blocking local storage no longer prevents the theme/application from starting.
- **Downloads:** links are refreshed after fresh payment verification. Duplicate taps are serialized. A customer can try opening again without reloading. Copy says **Download requested**, because a click cannot prove a file saved. Recovery on another device still requires the checkout-inbox code and verified payment.
- **Checkout clarity:** one payment of ₦9,639 for a PDF, no subscription, visible licence/refund/support links and an optional, unchecked check-in email. Chapter details collapse so the receipt field is easier to reach. No guarantee of sales or universal no-refund exclusion was added.
- **Keyboard/accessibility:** shared nested-dialog containment, forward/backward Tab wrapping, Escape and focus restoration; disabled controls are excluded. Icon-only buttons have labels; images have descriptive or explicitly decorative alt text. The Support footer link reaches the top heading and focuses it. Policy fragment links reach the relevant section.
- **Motion/performance:** 0.98 press feedback on primary controls, service cards and Haven chips; a subtle local page-progress line; existing pointer lighting retained on appropriate desktop devices. Reduced-motion settings disable decorative movement. The opening video has a 1.8-second ceiling, skips on reduced motion, and skips on Data Saver/2G where the browser exposes that signal. No continuous decorative animation loop or analytics collection was added by these effects.
- **Copy:** em dashes removed from current frontend copy and new Haven replies. Frozen legacy email payloads remain unchanged to preserve safe provider retries.

Browser checks used Chromium at 390 x 844 and desktop width, not physical iPhone Safari. The guide, main page, drawer, support page and checkout had no horizontal overflow in the examined views. Actual keyboard tests covered menu/service/Haven wrap, Escape and restored focus. Cookie controls measured about 45px high; checkout fit inside the mobile viewport. Automated checks are not a WCAG certification or a substitute for screen-reader and real-device review.

## 3. BOOKING LOGIC

**Status: active website guard, with explicit provider/identity limits.** There is no standalone `booking_locks` table. `booking_intents`, `reserve_strategy_booking`, `visitor_strategy_booking` and `strategy_call_bookings` implement the protection.

1. Website entry points reserve a 30-minute attempt in one serialized SQL transaction. The guard matches booking email, secure visitor link or linked review across Services, Haven and Team entry points.
2. A confirmed active booking blocks a second website reservation through its **scheduled end**, including a meeting currently in progress. If old provider data lacks an end, the branch uses a conservative 30-minute fallback after its start.
3. The signed webhook and authenticated poller save actual Calendly start/end and cancellation status. Polling explicitly requests active and canceled events and still reconciles already-processed bookings. A cancellation clears the lead badge and releases the active guard; stale active events cannot revive that canceled invitee.
4. Haven checks booking status **before generating a reply**. It can answer a linked call-time question in Lagos time without spending AI budget, directs the visitor to Calendly's confirmation for local time/joining/management, avoids another call offer, and continues helping with service questions.
5. Haven receives only a safe summary of verified review link, relevant service, verified reader access and booking times/status. Browser claims cannot forge that state. A small **Last reply used** line explains the context; it is checked again on the next message.

Scheduled end is not attendance. Calendly's confirmation is the booking source of truth. The website cannot universally enforce one booking per human across a separately opened public Calendly URL, fresh devices and different emails. The poller has a bounded recent-past/60-day-future scan and ordinary sync delay. A strict universal rule would require controlled scheduling plus verified identity, rather than a public reusable URL.

For one person per time slot, confirm Calendly's event is **one-on-one**, uses the correct conflict calendar, and disallows added guests. This provider configuration was not changed or independently verified through an authenticated Calendly account. No meeting was created or canceled during testing. A reschedule uses Calendly's management link, not a second website reservation.

## 4. MISSING FEATURES / RELEASE GATES

| Priority | Current evidence | What remains |
| --- | --- | --- |
| P1 | Four real synthetic marketing requests to the existing live Haven returned 3 useful answers and 1 HTTP 503. Successful replies used Groq. Francis reports unpaid provider quota and received the existing AI alerts. | Fund/enable the chosen provider account and verify model access and recorded failure diagnostics. A 503 alone does not prove a billing cause. Repeat a small multi-turn evaluation after deploying the updated prompt; do not remove budgets or add unlimited retries. |
| P1 | Production migration ledger showed substantial historical drift: only three entries despite many newer installed objects. | Compare the live catalog with the reviewed schema and rehearse adoption in staging. Do not blindly replay old migrations or mark unknown versions applied. |
| P1 | Public website `/health` still returns SPA HTML with HTTP 200. Direct Supabase health returns JSON 200 with five true infrastructure checks. | Deploy the new top-of-file proxy rule. Verify content type and JSON body, not status alone. New health also reports required/optional configuration presence and explicitly says provider availability is not probed. |
| P1 | Supabase secret-name recheck now confirms `SENTRY_DSN` and `IPINFO_TOKEN`. Francis reports Sentry, Netlify configuration and UptimeRobot setup. His “Edge operation failed” alert establishes receipt of an application failure event. | Fresh build/deploy with Netlify `VITE_SENTRY_DSN` in the production build context. The examined public entry bundle did not contain a detectable embedded DSN. Local `.env` is unnecessary for production. Inspect the function/status/request tags in fresh Sentry events and verify project privacy settings. |
| P1 | UptimeRobot is reported configured by the owner; no authenticated account/status-page evidence was available to this agent. | Confirm exact website/JSON health monitors, contacts and a downtime/recovery notification in that account. No activation request was submitted by this pass. |
| P1 | No `CALENDLY_WEBHOOK_SECRET` name appeared in the latest secret inventory. Polling remains the fallback; infrastructure health passed. | Install the actual subscription signing secret privately and verify created/canceled webhook delivery. Confirm one-on-one capacity and conflict calendars. |
| P1 | Local payment, OTP, webhook, retry and download security tests pass without real charges or email. | Owner acceptance on the actual provider: one purchase, interrupted/late callback, same-device reopen, second-device inbox recovery, failed download and a support/remedy request. Confirm the exact private production PDF exists and is the intended final edition. |
| P2 | Isolated PostgreSQL dump/restore and 10-client handler/SQL load tests pass. | Rehearse a real production-format backup restore and private Storage object bytes in staging. Local model stubs do not establish live AI capacity. |
| P2 | Mobile layout/keyboard checks pass in the examined Chromium views. Main bundle still exceeds Vite's 500KB warning threshold. | Real Safari/Android, slower-network and assistive-technology checks; measure Core Web Vitals before further splitting/animation work. |
| Deferred | Free-class video, some portraits and other unfinished content were explicitly deferred. | Owner supplies and signs off the final media. No placeholder video, fake testimonial or invented portfolio asset was added. |

The checkout and policies now explain the product, total price, recovery and remedy path before payment. Applicable consumer rights remain preserved. This is a technical/content audit, not legal clearance. The operator should obtain a Nigeria-specific review of the final merchant identity, licence/refund wording, privacy disclosures and any historical exposure response. FCCPC's guidance specifically calls for understandable language and full price disclosure. [FCCPC consumer rights](https://fccpc.gov.ng/consumers/consumer-rights-responsibilities/rights-responsibilities/)

## 5. SUGGESTED ENHANCEMENTS

These are follow-on work, not silently added commitments or launch blockers:

- Evaluate a small consented set of real multi-turn marketing conversations after the funded provider and new prompt are live. Score usefulness, repeated questions, unsupported diagnosis, unwanted offers, recovery and latency.
- Measure the complete paid-access journey and support outcome rather than treating a Shop click or download attempt as revenue or fulfilment.
- If attendance-based eligibility is essential, add a deliberate staff-completed meeting outcome and controlled, identity-verified scheduling. Do not infer attendance from time passing.
- Publish the final availability/support expectations and build a repeatable handover routine around **Start here**, saved next steps and second-admin approvals.

## Ratings out of 10

These are engineering judgments, not certification. “Before” reflects the initial code/live findings at the start of this audit. “Branch now” rates the implemented design and local/browser evidence; it is **not** a score for an undeployed production release. AI's branch score is especially provisional because its new prompt has not been exercised against the live model.

| Category | Before | Branch now | Why / final obstacle to 10 |
| --- | ---: | ---: | --- |
| Security & Privacy | 3.0 | 8.5 | Legacy anonymous conversation access was a critical defect. RLS regression, verified ownership, atomic budgets, MFA gates, safe Sentry settings and two-admin deletion now have evidence. Production catalog adoption, ingress assurance, incident assessment and a fresh deployed telemetry review remain. No system is impenetrable. |
| UI/UX & Accessibility | 7.5 | 8.8 | Clearer recovery, modest cookie controls, practical admin guide, keyboard focus and mobile layout improve the experience. Restrained motion avoids long intro blocking. Real-device/screen-reader evidence, performance measurements and final owner media prevent a 10. |
| AI Quality & Personality | 7.0 | 8.0 provisional | Haven asks for relevant evidence, avoids automatic Trust-leak claims, uses verified platform state and keeps reader/service/support roles coherent. Live baseline answered 3/4 synthetic scenarios; one provider failure and some overlong wording remain. Funded capacity plus evaluation of the newly deployed prompt is required before launch claims. |
| Business & Conversion Logic | 7.0 | 8.8 | Price is server-verified; recovery does not rely on email/reference alone; pending payment does not invite another debit; downloads can be retried; existing bookings suppress repeated booking offers. Actual paid fulfilment/recourse rehearsal and Calendly provider settings remain unproven. |

Haven is substantially more useful as a connected marketing guide on this branch. The public launch should promise practical help and a clear next step, not guaranteed sales, perfect diagnoses, universal tracking or uninterrupted service on unfunded provider quotas.

## Validation and reproducibility

Before pushing: **602 tests passed, zero failed/skipped; 13 focused security checks passed; lint, production build and all 45 Deno entry-point checks passed.** The final post-push rerun is reported in the accompanying chat. Run from the repository root:

```powershell
npm test
npm run test:security
npm run lint
npm run build
npm run test:load
npm run test:restore
npm audit --omit=dev
node scripts/build-launch-baseline.mjs --check
node scripts/security-smoke.mjs
```

All 45 Edge entry points were type-checked with Deno. Security smoke performs seven bounded invalid-input live checks and sends no real email, payment, appointment or AI request. `scripts/haven-launch-eval.mjs` is a four-case dry run by default; `--live` creates exactly four labelled guest conversations and uses normal provider budget. It is not a capacity benchmark. The isolated load test completed ten requests with ten overlapping stubbed provider calls, zero failures/timeouts and about 640ms mean latency in this run. The isolated restore covered reviews, linked chat, Storage metadata, admin RPCs and RLS; it did not restore production or Storage object bytes. Production dependency audit found zero known advisories at verification time.

The final local full suite, focused security suite and post-push full suite must have zero failures. Build currently succeeds with the disclosed bundle-size warning. Existing golden tests and a new archive retry test preserve legacy provider payloads; new mail/export requests use the current footer/readable archive.

## Release ordering and baseline adoption

1. Take a recoverable production backup and verify a staging restore including private object bytes. Inventory the current database schema, privileges, policies, triggers, functions, cron/Vault metadata and migration ledger without copying secrets or customer messages into evidence.
2. For an existing deployment, verify the exact catalog differences before applying the **P0 policy removal** and **launch hardening delta**. `20261105000002_launch_hardening.sql` contains current mail defaults, export versioning, cancellation badge refresh and booking-time context. Do not replay all historical migrations blindly.
3. The consolidated baseline `20261105000001_consolidated_baseline.sql` bootstraps a fresh application schema only when `brand_reviews` does not exist. Supabase-managed Auth/Storage infrastructure must exist first. It contains no customer backup, secret values, cron activation or ledger changes. On an existing database it performs limited safety checks and skips rebuilding; that is **not** full drift reconciliation. Ledger repair is a separate reviewed operator action after catalog comparison.
4. The deterministic generator covers 44 reviewed DDL sources. Tests compare fresh baseline versus historical application across columns, functions, policies, RLS, grants, constraints, indexes and triggers; replay preserves synthetic records and rejects a reintroduced anonymous conversation policy.
5. Recompute the affected function inventory with `node scripts/list-affected-functions.mjs --base 051a6ec --names`. Shared observability/security changes affect **all 45 handlers**, including the now-tracked, bounded `validate-hcaptcha`. Deploy the reviewed functions after their database dependencies. Preserve the existing internal keys and signed-link secrets.
6. Build/deploy the frontend from this reviewed branch with the correct Netlify production environment. Validate JSON `/health`, a new safe Sentry event, booking creation/cancellation, MFA and the complete purchase/recovery flow. Preserve current legacy email versions for pending deliveries; do not rewrite frozen payloads under existing provider keys.
7. Repeat the four-scenario and multi-turn Haven evaluation with funded providers. Confirm UptimeRobot downtime/recovery delivery and the staff handover. Leave dev unmerged until the user's chosen release process authorizes it.

Primary references used for this review include [Paystack verification/statuses](https://paystack.com/docs/payments/verify-payments/), [Calendly event filtering](https://developer.calendly.com/api-docs/calendly-api/scheduled-events/list-scheduled-events), [Supabase Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes), [Sentry's installed browser SDK source](https://github.com/getsentry/sentry-javascript/blob/11.10.0/packages/browser/src/client.ts), and [W3C evaluation guidance](https://www.w3.org/WAI/test-evaluate/).

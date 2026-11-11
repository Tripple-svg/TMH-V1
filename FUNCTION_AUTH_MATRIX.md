# Edge function authentication matrix

Audited on 5 November 2026. All 45 handlers use the shared observability wrapper. Gateway JWT checks are disabled for application-managed endpoints. An anon key never grants admin access.

The admin gate verifies the bearer with Auth, then checks current database role, bans/deletion, MFA assurance and the live Auth session using admin_access_allowed(actor, aal, session_id). Browser role checks only control presentation. The shared early app_metadata check follows getUser and never substitutes for the database gate. No admin-* handler reads a role directly. No user_metadata.role grants authority.

Internal credentials have infrastructure authority and must stay server-only. Signed capabilities are scoped to their purpose and record. Origin checks are additional protection, not authentication. Application limits below are separate from provider and infrastructure limits.

| Function | Authentication / authority | Limits and replay controls |
| --- | --- | --- |
| `admin-fetch-leads` | Admin JWT and current database gate | Admin network: 60/minute |
| `admin-operations` | Admin gate; recovery additionally needs a fresh password session and one-time backup code | Admin 60/minute; recovery 5/15min/network and 5/15min/admin |
| `admin-retry-purchase-email` | Admin gate | Admin network: 60/minute |
| `admin-security` | Admin gate | Admin network: 60/minute |
| `admin-support` | Admin gate | Admin 60/minute; recovery resets have a one-hour cooldown |
| `admin-team-assignment` | Admin gate | Admin 60/minute; assignment revision and claim fencing |
| `admin-update-lead` | Admin gate; legacy single-admin delete returns 409 | Admin network: 60/minute |
| `calendly-poll-bookings` | Internal poll secret | Trusted worker; durable event deduplication |
| `calendly-webhook` | HMAC on raw body; timestamp within 180 seconds | No public quota; signed event deduplication |
| `capture-booking-lead` | Public validated booking intent; origin check | 5/10min/network; booking guards |
| `check-email-exists` | Public bounded lookup | 5/10min/network and shared review cooldown/block |
| `confirm-data-deletion` | Email-delivered private token; explicit POST | 10/10min/network; token state and expiry |
| `confirm-data-export` | Email-delivered token digest; explicit POST | 10/15min/network; 24-hour expiry and one delivery |
| `content-performance` | Current optional browser profile proof and consent flag | 100/10s global; one event/profile/section/day |
| `create-brand-review` | Turnstile action/hostname verification and server-owned review/session capability | Shared network gate, two cooldowns then staff reset; one saved review/email |
| `flag-user` | Admin gate for manual actions; internal service credential for AI events | Admin 60/minute; AI event deduplication |
| `haven-chat` | Private visitor proof; review capability when linked; privacy notice version | 8/min/device, 30/min/network, 30/10min/device, 100/hour/network; daily AI call/token budgets |
| `health` | Public GET/HEAD; boolean check names only, including required and optional configuration presence | No application quota; 5-second DB request timeout; missing required configuration returns 503 |
| `paystack-webhook` | Paystack HMAC-SHA512 over raw body; payment/environment checks | No public quota; unique reference and idempotent delivery |
| `playbook-followup-unsubscribe` | Signed expiring opt-out capability; GET read-only | One cancellation/job; no public sending action |
| `read-team-assignment` | Signed record/revision/expiry capability | Bounded read; revoked/expired revisions denied |
| `record-cookie-consent` | Public strict notice/choice payload | 20/10min/network |
| `request-data-deletion` | Public email request; generic ownership-neutral response | 5/10min/network |
| `request-data-export` | Public email request; same verification flow for absent records | 5/15min/network; 3/hour/keyed email |
| `request-playbook-recovery` | Verified payment/email/reference; inbox challenge | 20/15min/network; 3/hour/pair |
| `score-social` | Private review capability and validated image evidence | 5/hour/review; 30/hour/network; daily AI budgets |
| `scrape-website` | Private review capability and SSRF/URL checks | 5/hour/review; 30/hour/network; daily AI budgets |
| `send-ai-usage-alerts` | Internal service credential or poll secret | Private claimed queue; stable provider key |
| `send-booking-confirmation` | Retired endpoint returns 410; OPTIONS 204 | No sending path |
| `send-flag-alert` | Internal service credential | Durable event marker and provider idempotency |
| `send-flag-customer` | Internal service credential | Durable event marker and provider idempotency |
| `send-lead-followup-nudges` | Internal service credential or poll secret; prior staff approval | At most 20/claim; one reminder/review; 23-hour retry window |
| `send-purchase-followup` | Internal service credential | Claimed opt-in jobs; frozen payload and retry window |
| `send-purchase-thankyou` | Internal service credential; stored recipient | Stored acceptance and stable provider key |
| `send-support-notification` | Internal service credential or poll secret | At most 20/claim; 23-hour retry window |
| `send-tmh-booking-confirmation` | Internal service credential; stored booking match | Per-invitee immutable email claim |
| `send-welcome-email` | Internal service credential; stored review recipient | Stored acceptance and attempt state |
| `site-presence` | Optional browser profile proof | 100/10s global; per-profile minimum update interval |
| `support-request` | Public hCaptcha and consent; optional verified browser link | 3/15min/network |
| `sync-haven-session` | Private review/session capability | Bounded snapshot and timestamp; no separate quota |
| `update-review-source` | Private review capability and revision check; explicit restart confirmation; service-only correction/restart RPCs | 10/hour/review; 20/hour/network; subsequent scoring budgets |
| `validate-turnstile` | Public bounded challenge validation with expected action and hostname | 5/10min/network; 4KB body; 10-second provider timeout. Submission handlers verify their own token. |
| `verify-paystack` | Server payment verification and checkout proof or device grant | 60/hour download/network; 5/hour checkout/network; invalid download 5/10min/network |
| `verify-playbook-recovery` | Inbox OTP keyed hash and verified payment | Five challenge guesses; shared verification network/device cooldowns |
| `zoho-support-webhook` | Pinned signed integration; one-time secret only during enrollment | Provider message-ID deduplication and bounded verification |

Logging audit: handler diagnostics use JSON events with level, event, timestamp and request_id. Raw Auth/database/provider errors are not serialized. The logger has no arbitrary metadata argument. Sentry receives restricted events with PII collection and default integrations disabled. Known 4xx responses remain client errors; 5xx and unhandled failures enter the reporting helper.

Network budgets use the validated Cloudflare ingress address only. X-Forwarded-For and X-Real-IP are ignored. Missing or malformed addresses share a conservative bucket. This depends on the production ingress overwriting CF-Connecting-IP; direct-origin exposure must remain disabled and should be verified in infrastructure testing. Visitor, review and global AI budgets remain additional controls.

Admin login recognition uses a random browser UUID bound to the authenticated admin through a keyed hash. IP or browser-version changes alone do not trigger a new-device email. A browser returning after 30 days is treated as new. This identifier never authorizes access or replaces MFA.

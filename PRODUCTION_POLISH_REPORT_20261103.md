# Production polish report

Branch: `feat/production-polish`, created from local `dev` at `cc157730aed4d248efc5946bb5a8de4a719f1cd6`. No merge, push, production function deployment or application-schema/data mutation was performed. Existing Supabase CLI cache edits were preserved separately from the release work. Changes remain uncommitted for review.

## Changes

| Request | Result |
| --- | --- |
| Admin login lockout | Five failed Supabase credentials responses trigger a persistent 15-minute browser pause. A 429 starts the cooldown immediately. Network failures do not count as password guesses. In-flight submission is guarded. |
| MFA enrollment and outages | Auth requests have a 20-second deadline. Settings can be reloaded after a connection loss. Successful enrollment remains clearly distinguished from failed backup-code generation. QR, secret and readable recovery codes stay in page memory. |
| Support prefill | Query category and message/description are read safely. A rate-limit link supplies a useful draft. Haven's failed-turn notice includes Contact support with the visible error, without access credentials. Browser verification confirmed the selected radio and prefilled text. |
| Deletion UI and emails | Zinc/glass modal, bounded mobile scrolling, keyboard focus containment/return, neutral success treatment, and matching email-safe zinc cards for request/completion and data-access emails. |
| Mobile admin | Purchases use mobile cards. AI budgets use cards instead of a horizontally scrolling table. Tabs form a two-column mobile grid. Touch controls have a 44px minimum and form text avoids mobile input zoom. Diagnostic panels are confined to Security & AI. |
| Legal copy | Privacy and Terms now explain AI budgets, relevant knowledge retrieval, support tracking, optional content metrics, staff login security, backups, error reporting and verified exports. New copy has no em dashes. Historical frozen email-template versions are retained for idempotent delivery. |
| Admin alert recipients | Support, AI and moderation alerts use one fixed list containing Francis, Paschal and Chimburuoma. New-device alerts and approved follow-up reminders use the same list. |
| Realtime arrivals | A minimal RLS-protected notification table publishes opaque support/booking arrival events. No request text or booking contact details enter Realtime. The dashboard authenticates before subscribing, shows live counts and tears down on logout. |
| Insights | Server aggregates 7/30-day conversations, saved route evidence, saved-review click interest, leak categories and safe first-message topic groups. Exact raw first messages are intentionally not returned in an aggregate view. |
| Rate-limit panel | Actual stored thresholds/windows, reset timestamps and audited clears. Network and device references remain keyed hashes; historical raw emails/IPs cannot be reconstructed or displayed. Daily AI spend controls remain separate. |
| Support SLA | A first-response timestamp is recorded only after staff confirm sending the actual reply. Unanswered requests older than 24 hours are visibly overdue. Opening a mail link does not count. |
| Login devices and Activity | Device/browser label, observed IP, optional city estimate, timestamp and admin reference; 30-day retention. Stable notification generation keys prevent resending a new-device alert on ordinary token refresh. |
| CSV export | Contact redaction defaults on, including ordinary email/phone patterns in notes. Names remain; this is not full anonymization. Reset view now preserves browser credentials and visitor access keys. |
| Two-admin deletion | Legacy single-admin delete is blocked in the API and SQL. A different current admin must approve an unchanged record within 24 hours. Same-admin approval, demotion, stale snapshots and replay are denied. Screenshot cleanup is persisted for retry. Purchases have the same approval requirement. |
| Monthly booking calendar | Upcoming active/confirmed calls, Lagos day grouping, selected-day cards, month navigation and searchable list alternative. Coverage remains the loaded 500 records. |
| MFA backup codes | Ten random 128-bit codes, shown once, stored as actor-bound keyed hashes. Recovery requires a fresh password session and one unused code; removes lost factors, revokes sessions and requires normal sign-in/enrollment afterward. Revoked JWT sessions are also denied by the DB/RLS gate. |
| Follow-up reminders | Three-day pending leads enter a team reminder queue. A human approves before the internal worker emails the three staff inboxes. No customer message is sent automatically. |
| Data access | Inbox-confirmed, expiring export flow emails a real ZIP containing matching review and linked-chat JSON. Export snapshots and retries are frozen, bounded and cleaned up. Caller-supplied recipient overrides do not change delivery. Separate record categories need verified human assistance. |
| Auth and logging audit | All 44 handlers use the shared observability wrapper. No admin handler reads roles directly. The shared verified-Auth metadata check is followed by the current DB gate. Raw database/provider exceptions were removed from logs and admin responses. |
| Health | Public GET/HEAD health checks DB/RPC, Vault presence, recent cron success and four successful worker heartbeats within 15 minutes. Missing configuration returns 503 with boolean check names. Daily retention jobs are not incorrectly required to run every 15 minutes. |
| Ethical hacking | Real PostgreSQL tests for cross-visitor IDOR, concurrent budget admission, recovery-code replay, approval replay and self-approval, stale/missing roles, revoked sessions, export binding and browser RLS denial. |
| Load testing | Autocannon with 10 independent visitors, real Edge handler, real PostgreSQL rules and a model stub. 10/10 successful requests, 10 concurrent provider requests, zero errors/timeouts, 533.5 ms average and 561 ms p99 on this machine. This does not verify Gemini/Groq production capacity. |
| Knowledge retrieval | Deterministic curated chunks, relevance ranking and bounded public/private context. Purchase verification still gates private chapters. Six representative prompts reduced system-prompt bytes by 28% to 34%. This is a byte measurement, not a claim about provider billing. |
| Sentry | React ErrorBoundary plus reporting from the existing page boundary; disabled without VITE_SENTRY_DSN. All Edge handlers use the helper reading SENTRY_DSN. Default integrations, tracing and default PII are off; event fields are allowlisted. |
| Content performance | Optional-consent-only section views/actions; current profile proof, per-day deduplication and aggregate reporting. No URLs, link labels, form contents, IPs or raw chat are collected for these events. |
| Backup restore | A physical 43,134,464-byte isolated PostgreSQL backup was restored and checked for reviews, chat text, Storage metadata, RPCs, grants and RLS. Hosted production backup restoration and actual private Storage file bytes were not rehearsed. |
| UptimeRobot | Configuration script and exact monitor URLs are ready. No monitor request or activation mail was submitted. Per your follow-up, Francis will create the account and add the other two alert contacts manually. |

## Validation and evidence

The final validation files live in `validation/production-polish/`. They distinguish local behavior from deployed behavior.

| Check | Result |
| --- | --- |
| Full suite | 573 passed, zero failed/skipped |
| Final UI regression subset after badge refresh wiring | 46 passed, zero failed |
| ESLint | Passed |
| Vite production build | Passed; existing large-main-chunk warning remains |
| Deno type check | All 44 Edge entrypoints passed |
| Dependency audit | Zero vulnerabilities; both lockfiles synchronized |
| Public deployed negative checks | 7/7 passed |
| Ten-user isolated load | 10/10 responses, zero errors/timeouts |
| Physical isolated restore | Passed; production/customer Storage restoration not claimed |

The load and restore JSON and captured command outputs contain the precise scope and results. These checks do not substitute for the production acceptance cases below.

Additional commands are available as `npm test`, `npm run test:security`, `npm run test:load`, `npm run test:restore` and `npm run monitor:preview`. The load/restore scripts use synthetic isolated data. A local loopback restriction required running the load test outside the shell sandbox; it made no production or paid-model calls.

Browser checks covered the real support rate-limit deep link, mobile admin sign-in and the data-access form at 390px. A temporary synthetic-data preview also verified the real Insights, Security cards, monthly calendar, selected-day call and overdue Support components. No horizontal overflow was observed in the checked views. The November 5 synthetic call correctly appeared at 13:00 Lagos for 12:00 UTC. No real password, CAPTCHA, private review, purchase or support submission was used. Authenticated dashboard interactions are covered by component tests and real SQL/API harnesses; a signed-in production mobile acceptance session remains pending. The temporary preview is removed from release files.

## Live findings

Read-only inspection found 32 application tables, all with RLS enabled, and 59 pre-existing public RPCs. The newer feature schema exists, but the migration ledger records only the first three historical migrations. Do not blindly replay the historical directory or mark unverified migrations applied. Reconcile this drift and apply the three new migrations in order through a controlled release.

Seven existing cron jobs were active, with successful SQL runs recorded. The internal poll Vault secret had exactly one entry and passed its minimum-length check. SQL cron success alone does not prove downstream HTTP/provider delivery, so the new health check also requires worker success markers.

Configured-secret names did not include SENTRY_DSN, IPINFO_TOKEN or CALENDLY_WEBHOOK_SECRET. No secret values or digests are retained in the validation evidence. Sentry delivery and city estimates therefore need configuration; the existing Calendly webhook also needs its matching provider signing secret. The existing polling route is a separate integration. Do not generate an arbitrary webhook secret without updating its provider subscription.

The public negative smoke checks passed 7/7 against the currently deployed site. They do not validate this branch's undeployed new endpoints or successful admin/MFA/email/model operations.

## Release work still required

1. Preserve a hosted recovery point and private Storage backup, reconcile the migration ledger, then deploy the three new migrations and all affected functions. Publish the frontend built from this branch. This pass did not alter production.
2. Apply `supabase/manual/20261103_schedule_production.sql`, confirm the three existing high-frequency workers and the new nudge worker actually succeed, then verify health changes to 200.
3. Configure optional Sentry project DSNs and, if city estimates are wanted, the approved IPinfo connection. Verify a sanitized test event. Provision the matching Calendly webhook signature configuration if that path is enabled.
4. Complete a staff-owned enrollment, backup recovery and two-admin approval acceptance run with disposable staging records, plus actual receipt checks in all three inboxes. No production data was deleted to test these features.
5. Francis creates UptimeRobot manually, adds Paschal and Chimburuoma, then configures the website and health monitors and verifies downtime/recovery alerts. No activation is implied by the prepared script.
6. Restore a real hosted backup and private Storage files into isolated staging, record recovery times and verify entitlements and RLS. The local rehearsal is not evidence that the hosted recovery point is usable.

See `FUNCTION_AUTH_MATRIX.md`, `ADMIN_HANDBOOK.md` and the appended **Pass 2 additions** in `DEPLOYMENT_RUNBOOK_20261101.md` for operator details.

Implementation references: [Supabase MFA factor administration](https://supabase.com/docs/reference/javascript/auth-admin-deletefactor), [Supabase Edge Sentry guidance](https://supabase.com/docs/guides/functions/examples/sentry-monitoring), [NDPC implementation guidance](https://ndpc.gov.ng/wp-content/uploads/2025/03/NDP-ACT-GAID-2025-MARCH-20TH.pdf), and [UptimeRobot monitoring setup](https://help.uptimerobot.com/en/articles/11358364-how-to-create-your-first-monitor-on-uptimerobot-quick-setup-guide).

# TMH deployment runbook — 1 November 2026

This release is prepared locally on `codex/support-recovery-and-production-audit`, compared with repository revision `641843bb466c5bdbb677afbe66cc9708b171bc36`. It has **not** been deployed by this audit. Preserve the existing dirty worktree. The previously deployed baseline is reported by the owner; this comparison revision is not proof of its live deployment. Verify migration history and jobs rather than replaying all historical setup. Target project: `dkpoygkduktusrnsbpaq`; public origin: `https://themarketinghaven.xyz`.

## 1. Prepare a recoverable release

Record the release revision/artifact, current successful Netlify deploy ID, deployed Supabase function versions, migration history, Cron job names/statuses, and provider configuration changes. Take a database backup and preserve private Storage objects separately; confirm who can restore both. Keep evidence and credentials in the operator's private workspace.

Use **Node 24** for the CLI/build/test session and Netlify build environment. Run `npm ci` with this release's `package-lock.json`; do not regenerate it on the production host. Vite is now `8.3.5`, React plugin `6.1.2`, and esbuild `0.28.2`. Browser build targets remain explicit in `vite.config.js`. Browser SDKs pin `@google/genai` `2.18.0`, `@supabase/supabase-js` `2.115.0`, `groq-sdk` `1.5.0`, and `openai` `7.5.0`; Edge imports pin Supabase `2.118.0` and Deno std `0.224.0`. Installing a newer SDK is a separate change. Check resolved versions with `npm ls @google/genai @supabase/supabase-js groq-sdk openai vite @vitejs/plugin-react esbuild`.

From the repository root, complete:

```powershell
node --version
npm ci
npm run lint
node --test --test-concurrency=2 tests/*.test.mjs
npm run build
npm audit --audit-level=high
node scripts/check-final-migrations.mjs "C:\Projects\tmh-platform\node_modules\@electric-sql\pglite\dist\index.js"
node scripts/list-affected-functions.mjs
```

`check-final-migrations.mjs` is an additional isolated legacy-baseline schema harness; its explicit module path is required. It deliberately applies selected migrations only through `20261027000002_purchase_followup.sql` and does not install or validate the new Auth/MFA gate. Current migrations, including `admin_access_allowed`, have dedicated tests in the main suite. Neither proves that production applied migrations or that Cron executes. CI configuration is also part of this release. Record actual results; do not substitute a previous test run after changing source or dependencies.

## 2. Configure secrets and Auth before switching traffic

Use the Supabase secret manager and provider dashboards. Record names/presence and rotation dates only. Never put a secret in `VITE_*`, Git, a ticket, chat, screenshots, command history or a cron command literal. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions; keep that service credential server-only.

| Configuration | Required action |
| --- | --- |
| `INTERNAL_POLL_SECRET` | Preserve/provision a random secret of at least 32 characters. Store the **same value** in Supabase Vault as **`tmh_internal_poll_secret`**. Calendly polling, support notifications and AI alerts use it. Check for exactly one named Vault entry. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Confirm an active sending key and verified sender domain. Default shared sender is `The Marketing Haven <info@themarketinghaven.xyz>`; the existing deletion-link function separately sends from the fixed `info@themarketinghaven.xyz` address, so verify that domain too. This config sends Edge transactional/team mail. An accepted API request is not proof of inbox delivery. |
| `HCAPTCHA_SECRET`, optional `HCAPTCHA_SITE_KEY` | Confirm the active secret/sitekey pair and allowed production/approved preview hostnames. The browser uses its matching public sitekey. Support and review submission depend on this. |
| `GEMINI_API_KEY`, `GEMINI_ENABLED`, optional `GEMINI_MODEL`; `GROQ_API_KEY`, optional `GROQ_MODEL` | Confirm billing/account/model access with the provider. Preserve the chosen configuration. `GEMINI_ENABLED=false` explicitly disables Gemini; a missing key is not a paid-model test. Configure provider billing caps as well as the application budgets. |
| `AI_DAILY_TOKEN_ALERT_THRESHOLD` | Preserve or choose an alert threshold against the real budget. This alert threshold is separate from the enforceable `ai_budget_settings` limits. |
| `CALENDLY_API_TOKEN`, `CALENDLY_WEBHOOK_SECRET` | Preserve the existing PAT and matching webhook signing key. Verify both created/canceled subscriptions privately. `scripts/setup-calendly-webhook.mjs` can create subscriptions and print a signing secret; run only in a private operator session when setup is actually needed. Do not copy its output into shared evidence. |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_ENV` | Preserve the correct production/test pair and provider webhook configuration. Never route a test transaction through production settlement by changing only the browser key. |
| `TEAM_ASSIGNMENT_LINK_SECRET`, `PURCHASE_FOLLOWUP_UNSUBSCRIBE_SECRET` | Preserve existing stable values if configured. Rotating them can invalidate previously issued links. These are server secrets; source has service-key fallbacks. |
| Playbook follow-up Vault entries | Existing follow-up scheduling separately uses `tmh_project_url` and `tmh_internal_service_key`. These are **not** substitutes for `tmh_internal_poll_secret`. Verify presence privately if that existing worker is enabled. |
| Optional Zoho enrollment | Follow the private operator instructions in [ZOHO_SUPPORT_SETUP.md](supabase/manual/ZOHO_SUPPORT_SETUP.md). Do not copy enrollment URLs, tokens, pinned signing secrets or payloads into this runbook. Remove `ZOHO_WEBHOOK_ENROLLMENT_TOKEN` after successful enrollment. |
| Netlify public environment | Preserve `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CALENDLY_URL`, the matching `VITE_HCAPTCHA_SITE_KEY` if configured, and existing public payment configuration. Verify the URL points to this project. `public/_headers` now restricts Supabase CSP connections/media to this exact project; another project requires an intentional source/config change. |

**Auth mail is a separate setup.** Configure Supabase **Auth custom SMTP** with the chosen provider's SMTP host, port, username, password, sender address/name and verified DNS. Setting `RESEND_API_KEY` on Edge Functions does not configure Auth. Confirm invite and password-recovery templates preserve the Auth confirmation URL; disable mail-link rewriting/tracking that breaks single-use links. Set Auth Site URL to `https://themarketinghaven.xyz` and allow the exact callback `https://themarketinghaven.xyz/admin/accept-invite` (plus only deliberately approved local/preview callbacks). Review Auth email/OTP limits and sender-domain SPF/DKIM/DMARC. Supabase's built-in sender is restricted and is unsuitable as proof that arbitrary customer/staff addresses receive production mail. See [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Auth URL configuration](https://supabase.com/docs/guides/auth/general-configuration), and [Auth limits](https://supabase.com/docs/guides/auth/rate-limits).

**Admin accounts and MFA.** Use trusted Auth administration to grant `app_metadata.role = admin`; browser `user_metadata` or a matching typed email grants nothing. Confirm TOTP enrollment is enabled for this project. MFA is opt-in in this release: staff without a verified factor retain password access; once a factor is verified, existing AAL1 sessions must challenge and both Edge authorization and RLS require AAL2. Enroll one approved staff account, verify the authenticator, sign out/in, and rehearse challenge/removal with the owner present. Do not store QR codes, TOTP seeds or OTPs in the test record. Password reset does not remove MFA. Lost-authenticator recovery requires the owner's identity check and trusted Auth factor administration; do not bypass it by weakening the RLS function. Staff password changes use 15–128 characters. A new public account is not an admin, and this work does not claim to add or prove a public signup flow.

## 3. Apply only pending migrations, in this order

Inspect the production migration history first. Link the CLI to the exact project in a private authenticated operator session, then inspect the pending plan:

```powershell
supabase link --project-ref dkpoygkduktusrnsbpaq
supabase migration list --linked
supabase db push --linked --dry-run
```

Resolve unexpected historical gaps or drift before `supabase db push --linked`. Do not mark unknown SQL as applied just to clear a warning. The intended new sequence is:

| Order | Migration | Purpose / dependency |
| --- | --- | --- |
| 1 | `20261031000000_support_requests.sql` | Support queue, staff actions, durable notification claim and scoped resets. |
| 2 | `20261031000001_deletion_cleanup.sql` | Transactional review/chat removal with persisted screenshot cleanup paths. |
| 3 | `20261031000002_zoho_support.sql` | Private pinned incoming-mail webhook credentials; requires support schema. |
| 4 | `20261031000003_calendly_vault_cron.sql` | Removes the old placeholder-based poller and schedules only if the named Vault secret already exists. |
| 5 | `20261031000004_ai_budgets.sql` | Atomic call/token reservations, counters and pause settings. |
| 6 | `20261031000005_admin_audit.sql` | Current-Auth-role check plus transactional staff mutations and append-only audit; depends on support/budgets and the baseline. |
| 7 | `20261031000006_visitor_activity.sql` | Aggregate existing saved chat activity; separate from optional whole-site presence. |
| 8 | `20261101000000_privacy_operations.sql` | Server-owned cookie receipts and 180-day inactive chat content/two-year receipt maintenance. |
| 9 | `20261101000001_site_presence.sql` | Consented browser-profile presence and 13-month inactive-profile expiry. |
| 10 | `20261101000002_admin_mfa.sql` | Updates the current-admin RLS predicate and adds service-only `admin_access_allowed(p_actor,p_aal)` for private Edge reads; both check current Auth roles/bans/deletion and enforce AAL2 for enrolled staff. |

After reviewing the dry run, apply the pending sequence. Migrations 1–10 precede the new Edge code and frontend. Every private admin Edge handler now calls `admin_access_allowed` after verifying its bearer with Auth `getUser`. A missing/failing RPC denies Admin with HTTP **503**; a completed gate rejecting role/account/MFA access returns **403**. Install and verify this RPC **before deploying admin Edge code**. Existing functions should remain compatible while the additive tables/columns/RPCs are installed. Verify schema/RLS immediately. The Calendly migration can leave the poller **unscheduled** if Vault was not ready; a recorded migration version does not prove an active job.

## 4. Deploy the exact affected Edge Functions

The inventory includes tracked changes, untracked functions/shared modules, transitive relative imports, and changed function config sections. Recompute from the final release worktree with `node scripts/list-affected-functions.mjs --base 641843bb466c5bdbb677afbe66cc9708b171bc36 --names` (or `--json` for reasons). The default comparison is `HEAD`, suitable while these changes are uncommitted; retain the explicit baseline after making a release commit. Shared modules are bundled into each importer; they are not deployed independently. The current release requires these **26** functions:

```text
admin-fetch-leads
admin-retry-purchase-email
admin-security
admin-support
admin-team-assignment
admin-update-lead
capture-booking-lead
check-email-exists
confirm-data-deletion
create-brand-review
flag-user
haven-chat
paystack-webhook
record-cookie-consent
request-data-deletion
request-playbook-recovery
score-social
scrape-website
send-support-notification
site-presence
support-request
sync-haven-session
update-review-source
verify-paystack
verify-playbook-recovery
zoho-support-webhook
```

In particular, `request-playbook-recovery`, `update-review-source`, `verify-paystack`, and `verify-playbook-recovery` need redeployment even though their entrypoints were unchanged. Their shared dependencies changed. `record-cookie-consent` is a new required server endpoint; deploying only the banner/frontend will leave current analytics consent unacknowledged.

`supabase/config.toml` adds deliberate `verify_jwt = false` entries for `admin-fetch-leads`, `admin-update-lead`, `check-email-exists`, `request-data-deletion`, `confirm-data-deletion`, and the seven new functions. Each uses its application-level staff/capability/HMAC/internal/public-input controls. Deploy with this release's config; gateway settings are part of the release. Existing admin functions require a verified current staff JWT; disabling the gateway check does not make a public key an admin.

The following operator command deploys the recomputed list and stops on failure. Review the inventory before running it. Keep all new secrets/schema ready first.

```powershell
$tmhFunctions = @(node scripts/list-affected-functions.mjs --base 641843bb466c5bdbb677afbe66cc9708b171bc36 --names)
if ($LASTEXITCODE -ne 0 -or $tmhFunctions.Count -eq 0) { throw 'Function inventory failed' }
foreach ($tmhFunction in $tmhFunctions) {
  supabase functions deploy $tmhFunction --project-ref dkpoygkduktusrnsbpaq
  if ($LASTEXITCODE -ne 0) { throw "Deploy failed: $tmhFunction" }
}
supabase functions list --project-ref dkpoygkduktusrnsbpaq
```

The unchanged `calendly-poll-bookings`, `send-ai-usage-alerts`, and `send-purchase-followup` are existing operational workers, not additional code changes in this inventory. Verify that the intended baseline versions already exist before scheduling; deploy them separately only if production is missing that baseline.

## 5. Activate and verify jobs deliberately

After migrations, secrets and worker deployment, run the repository SQL files in the private Supabase SQL editor. They use Vault lookups, not pasted raw secrets. Schedules below are UTC; Lagos is UTC+1.

| SQL to run / inspect | Expected job and cadence |
| --- | --- |
| `supabase/manual/20261031_schedule_support.sql` | `tmh-support-notifications` every minute; `tmh-support-retention` at 03:31 daily (04:31 Lagos). Requires support worker and `tmh_internal_poll_secret`. |
| `supabase/manual/20261101_schedule_privacy.sql` | `tmh-private-content-retention` at 03:43 daily (04:43 Lagos). Apply **both** privacy and site-presence migrations first: the job references `site_presence_visitors`. |
| `20261031000003_calendly_vault_cron.sql` | `calendly-poll-bookings` every five minutes. If it skipped before Vault setup, rerun this SQL after Vault/worker readiness; do not forge another migration-history entry. |
| Existing `supabase/manual/20261029_schedule_ai_alerts.sql` | Verify `tmh-ai-usage-alerts` every five minutes and `tmh-security-retention` at 03:17 daily. Apply/reapply only when this baseline setup is missing or being deliberately repaired. |
| Existing `supabase/operations/schedule-playbook-followup.sql` | Verify `tmh-playbook-followup-every-minute` every minute if optional follow-up is enabled. It uses its separate project URL/service-key Vault entries. |

The support worker always targets **both** `francis.teamhaven@gmail.com` and `paschal.tmh@gmail.com`. It does not send a customer receipt or reply. A saved support reference proves the request was queued, and `notification_accepted_at` proves Resend acceptance; neither proves either inbox received it. Follow up in Zoho for incoming-mail support. A stranded ambiguous notification past the retry window requires investigation before deliberate retry, to avoid duplicates.

Read-only production checks below intentionally omit values, bearer headers, webhook URLs, `cron.job.command`, message bodies and customer identities. Run through the private operator connection. Do not call retention or mutation RPCs merely to inspect them.

```sql
-- Confirm expected versions (and inspect earlier baseline history separately).
select version, name from supabase_migrations.schema_migrations
where version >= '20261031000000' order by version;

-- Names/readiness only: no decrypted_secret output.
select name, count(*) as entries,
       bool_and(length(decrypted_secret) >= 32) as minimum_length_ok
from vault.decrypted_secrets
where name in ('tmh_internal_poll_secret','tmh_internal_service_key')
group by name;
select count(*) = 1 as project_url_entry_present
from vault.secrets where name = 'tmh_project_url';

select jobid, jobname, schedule, active from cron.job
where jobname in ('calendly-poll-bookings','tmh-support-notifications',
 'tmh-support-retention','tmh-private-content-retention','tmh-ai-usage-alerts',
 'tmh-security-retention','tmh-playbook-followup-every-minute') order by jobname;

select j.jobname, d.status, d.start_time, d.end_time
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
where j.jobname in ('calendly-poll-bookings','tmh-support-notifications',
 'tmh-support-retention','tmh-private-content-retention','tmh-ai-usage-alerts',
 'tmh-security-retention','tmh-playbook-followup-every-minute')
order by d.start_time desc limit 40;
-- A successful SQL cron run can still enqueue a failed HTTP call.
select id, status_code, timed_out from net._http_response order by id desc limit 20;

select c.relname, c.relrowsecurity from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('support_requests','support_actions',
 'mail_webhook_integrations','ai_budget_settings','ai_budget_counters',
 'ai_budget_reservations','admin_audit_events','cookie_consents','site_presence_visitors')
order by c.relname;
select has_table_privilege('anon','public.cookie_consents','INSERT') as anon_cookie_insert,
       has_table_privilege('authenticated','public.cookie_consents','INSERT') as authenticated_cookie_insert,
       has_table_privilege('anon','public.admin_audit_events','SELECT') as anon_audit_read,
       has_table_privilege('authenticated','public.site_presence_visitors','SELECT') as browser_presence_read;
-- All four privilege booleans above should be false.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in ('claim_support_notifications',
 'prepare_saved_review_deletion','complete_saved_review_deletion','reserve_ai_budget',
 'settle_ai_budget','run_admin_mutation','haven_visitor_activity',
 'expire_inactive_haven_content','record_site_presence','site_presence_activity',
 'is_tmh_admin','admin_access_allowed')
order by proname;
with gate as (select to_regprocedure('public.admin_access_allowed(uuid,text)')::oid as oid)
select oid is not null as admin_gate_installed,
       coalesce(has_function_privilege('service_role',oid,'EXECUTE'),false) as service_can_check,
       coalesce(has_function_privilege('anon',oid,'EXECUTE'),false) as anon_can_check,
       coalesce(has_function_privilege('authenticated',oid,'EXECUTE'),false) as browser_can_check
from gate;
-- Expected: true, true, false, false.
select tgname from pg_trigger
where tgrelid = 'public.admin_audit_events'::regclass and not tgisinternal order by tgname;

select chat_enabled, scoring_enabled, visitor_daily_calls, visitor_daily_tokens,
 review_daily_calls, review_daily_tokens, network_daily_calls, network_daily_tokens,
 global_daily_calls, global_daily_tokens, updated_at from public.ai_budget_settings where id;
select day, calls, tokens from public.ai_budget_counters where bucket = 'global'
order by day desc limit 7;
select count(*) as unsettled_reservations from public.ai_budget_reservations where settled_at is null;
select status, count(*) as requests,
 count(*) filter (where notification_accepted_at is null) as notification_pending
from public.support_requests group by status order by status;
select notification_error, count(*) from public.support_requests
where notification_error is not null group by notification_error;
select count(*) = 1 as zoho_enrolled from public.mail_webhook_integrations where provider = 'zoho';
select notice_version, consented, count(*) from public.cookie_consents
group by notice_version, consented order by notice_version, consented;
select count(*) as retained_profiles,
 count(*) filter (where last_seen between now() - interval '5 minutes' and now()) as active_profiles
from public.site_presence_visitors;
select count(*) as verified_admin_accounts from auth.users
where raw_app_meta_data->>'role' = 'admin' and deleted_at is null
and (banned_until is null or banned_until <= now());
select count(distinct f.user_id) as admins_with_verified_factors
from auth.mfa_factors f join auth.users u on u.id = f.user_id
where f.status = 'verified' and u.raw_app_meta_data->>'role' = 'admin' and u.deleted_at is null;
select action, outcome, count(*) from public.admin_audit_events
where occurred_at > now() - interval '1 day' group by action, outcome order by action, outcome;
```

Inspect any underlying failure privately in provider/Edge logs, with redaction. Empty HTTP response history can reflect short retention and is not proof of success. Wait for real scheduled runs and verify both the cron result and HTTP status. No job schedule is asserted active by this local runbook.

## 6. Publish frontend and complete acceptance testing

Build a Netlify preview with Node 24, `npm ci`, `npm run build`, publish directory `dist`, and the intended public environment. Verify deep links (`/support`, `/admin`, `/admin/accept-invite`, deletion confirmation, legal pages), CSP headers, hCaptcha and mobile navigation. Set only approved preview origins/callbacks in the matching service configurations. After backend/config verification, publish the reviewed frontend artifact to production. Keep its deploy ID.

Use synthetic records and the approved QA inbox **`francis.teamhaven@gmail.com`** for customer-facing test mail. Do not use invented/uncontrolled customer addresses. Team notifications intentionally go to both approved team recipients above. No actual email is sent by this runbook or local tests; the operator must deliberately perform the live cases and record provider acceptance plus human inbox confirmation separately.

| Acceptance case | Evidence to record without credentials |
| --- | --- |
| Admin invite/recovery | Approved account invite, newest recovery link, successful password set, expired/reused link rejection, sign-out/in, non-admin rejection, and actual Auth SMTP inbox receipt. Do not promote a new QA account implicitly. |
| MFA | Enrollment confirmation, AAL1 challenge for an enrolled admin (including an older session), AAL2 access, failed-code handling, password change while enrolled, factor removal after valid challenge, and current-role demotion rejection. Use a reversible approved staff account and restore its intended state. |
| Support | Submit with hCaptcha, obtain one reference, inspect the Admin Support entry, record status/reason, verify scoped lock reset without granting review ownership, confirm audit entry, and confirm exactly one notification in **each** team inbox. An email link click alone does not submit the form. |
| Zoho (optional) | Perform private enrollment using its setup document; send approved test mail, verify one deduplicated metadata-only request, then check both team inboxes. Do not mistake a signed sender address for customer ownership proof. |
| Review/chat | URL and screenshot review, saved-capability reopen, source correction, functional Haven conversation, separate visitor/review context, and human support access during review throttling. Validate malformed/oversized inputs and provider failure behavior without expensive repeated calls. |
| AI spend | Review application limits in Admin Security against real provider pricing. Confirm pause controls stop new model admissions; resume intended settings. Make at most the agreed bounded Gemini/Groq test calls and check actual provider billing/usage. Unknown reservations remain charged after a crash; do not refund them merely to clear a counter. Local mocks do not verify paid Gemini access. |
| Consent/presence | Decline: no optional identity/heartbeat. Accept: server receipt succeeds before heartbeat; Admin aggregates consented browser profiles. Two tabs share a profile; withdrawal stops future heartbeats. Confirm old/expired affirmative choices ask again. Counts represent browser profiles and five-minute activity, not unique people or every visitor. |
| Deletion | With a disposable QA review, opening a link/GET causes no deletion. Explicit confirmation removes the matched review/chats, cleans private screenshots, preserves separate purchase/booking records, and retries failed Storage cleanup. Delete only the disposable record after checking its identity. |
| Purchases/bookings | Use the provider's intended test environment/approved synthetic purchase; verify signature rejection, idempotency, correct entitlement/recovery/download and booking/cancellation reconciliation. Confirm QA thank-you/recovery/booking mail and both applicable team notifications. Do not create a real payment or appointment solely to make a green checklist. |
| Retention and audit | Verify migrations and daily jobs. Exercise expiry/Storage restoration on synthetic data in staging. Confirm an authorized reversible mutation adds one audit event; browser credentials cannot read or alter audit data. Do not purge live rows to test a schedule. |

After deployment, `node scripts/security-smoke.mjs` performs bounded negative HTTP checks with public project configuration. It rejects unauthorized access and forged requests; it does not prove authenticated success, signup, SMTP, paid models, payment, cron scheduling, or inbox delivery. Review its requests before running against production.

## 7. Roll back without losing records

1. If necessary, pause affected AI admission through Admin Security and deactivate only the affected cron jobs in the private dashboard. Capture incident evidence first. Do not delete support/audit/customer rows to make errors disappear.
2. In Netlify, publish the recorded previous successful **atomic deploy**; this restores that complete frontend artifact without rebuilding. Lock/pause automatic publishing while investigating if needed. [Netlify deploy management](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/) documents publishing an existing deploy.
3. Redeploy the recorded previous compatible Edge source/config for affected functions. Netlify rollback does not roll back Supabase Edge Functions, database, Auth settings, Vault, cron or provider webhooks. New endpoints can remain installed and unused; disable an affected integration/job instead of dropping its data.
4. Prefer a forward corrective migration. These additions include valuable support, consent, audit, deletion-cleanup and budget records: **do not drop their tables, reverse erasure by recreating customer data, erase audit history, or delete paid entitlements**. Check compatibility before restoring older `is_tmh_admin`, `admin_access_allowed` or mutation RPC definitions; preserve enrolled staff MFA enforcement. A database restore is a separate owner-controlled recovery decision with a known restore point and Storage reconciliation, not an automatic deploy rollback.
5. Restore intended secrets/provider settings/jobs from the private change record, without exposing values. Re-run read-only checks and the bounded approved acceptance cases. Record any still-disabled feature and assign an owner.

## Release evidence and remaining work

Record actual dates/results, release/deploy/function versions, applied migration versions, expected job status and recent executions, SMTP/provider setup, QA inbox receipts and rollback rehearsal. Local verification cannot establish current production grants, SMTP, signup behavior, paid Gemini access, Cron execution or delivered email. Treat each as pending until the corresponding private production evidence exists. Privacy operating/retention/provider-contract actions are tracked separately in [PRIVACY_OPERATIONS_20261101.md](PRIVACY_OPERATIONS_20261101.md).

## Pass 2 additions

Source branch: `feat/production-polish`. No merge to dev or production deployment was performed by this pass. Read [PRODUCTION_POLISH_REPORT_20261103.md](PRODUCTION_POLISH_REPORT_20261103.md), [FUNCTION_AUTH_MATRIX.md](FUNCTION_AUTH_MATRIX.md) and [ADMIN_HANDBOOK.md](ADMIN_HANDBOOK.md) first.

### Database preflight and migration drift

Read-only production inspection found all 32 expected pre-existing application tables with RLS enabled and 59 public RPCs, but the ledger lists only three early migrations. Treat the schema as manually advanced until verified otherwise. **Do not run a blind db push or replay the old directory.** Compare the actual definitions/grants with the historical source, document the drift, and apply only the new SQL below after a recoverable hosted backup. Do not invent historical migration acknowledgements.

1. `20261103000000_production_admin.sql`: session-aware admin/RLS gate, safe Realtime arrival events, MFA backup hashes, login devices/activity, approval requests, audited limits, support reply timestamps, Insights and approved nudge queue.
2. `20261103000001_privacy_health.sql`: export snapshots, worker success markers, fail-closed health RPC and private retention.
3. `20261103000002_content_performance.sql`: optional analytics receipts, daily section aggregates and retention.

The old single-admin deletion route intentionally stops working once the first migration is applied. The frontend uses requests and a second admin's approval instead. Deploy the new API and frontend in the same controlled release. Revoked session JWTs are denied by the new three-argument gate. Preserve the existing two-argument gate as the reviewed compatibility dependency of that function; never substitute it for the new session check in Edge code.

### Functions, configuration and cron

All 44 Edge handlers import the shared observability wrapper, so deploy all affected handlers and shared imports. New endpoints: `admin-operations`, `request-data-export`, `confirm-data-export`, `content-performance`, `health`, and `send-lead-followup-nudges`. Existing admin/support/deletion/chat/mail workers also changed. Keep gateway JWT configuration from `supabase/config.toml` and the application authentication matrix together.

| Setting | Action |
| --- | --- |
| `VITE_SENTRY_DSN` | Optional public browser project DSN. Missing means no client telemetry. This is not an auth token. |
| `SENTRY_DSN` | Optional server Sentry project DSN. Verify a sanitized event before enabling incident routing. Missing means no server telemetry. |
| `IPINFO_TOKEN` | Optional server-only token for city estimates. Without it Activity honestly shows city unavailable. Review the provider processing arrangement before enabling. |
| `CALENDLY_WEBHOOK_SECRET` | Absent from the inspected configured-secret names. Configure the actual matching Calendly subscription/signing secret if the webhook is enabled. Polling is separate. Never pick an unrelated value merely to satisfy presence. |
| Existing internal poll/Vault pair | Reuse the matching existing secret. Readiness checks confirmed one Vault entry and minimum length without reading its value. |
| Dependencies | Both npm and pnpm lockfiles are synchronized. ZIP handling pins patched `fflate` 0.8.3. The load tool's nested UUID pin is patched for both package managers. Use the checked-in lockfile for the chosen manager. |

Apply `supabase/manual/20261103_schedule_production.sql` after deploying the worker. It schedules the approved lead reminders every five minutes and private/content retention daily. Verify the existing Calendly poll, support notification and AI alert jobs remain active at intervals below 15 minutes.

The public endpoint is `https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/health`. Expect 503 until database/RPC, Vault, four named cron jobs and all four worker heartbeats pass. The workers are Calendly polling, support notifications, AI alerts and approved lead reminders. Daily retention jobs are checked separately. Verify real downstream HTTP success, not just a successful SQL enqueue.

Team alerts now include `francis.teamhaven@gmail.com`, `paschal.tmh@gmail.com` and `chimburuomac@gmail.com`. Existing provider acceptance markers are not resent automatically to newly added recipients. Check new events in all three inboxes. Preserve frozen historical payloads and provider idempotency keys during retries.

### UptimeRobot account setup

Per the owner's follow-up, leave account creation and submission manual. Francis will create the account under `francis.teamhaven@gmail.com`, then add Paschal and Chimburuoma as alert contacts. No activation request was submitted by this pass.

Create HTTP(S) GET monitors for `https://themarketinghaven.xyz/` and `https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/health`, with five-minute checks and the three verified alert contacts. Require a successful status, and for health also check the `ok: true` JSON result if the chosen plan supports assertions. Do not monitor a paid AI generation endpoint or attach a service credential. Confirm actual downtime and recovery mail using staging or a reversible monitor test.

`npm run monitor:preview` prints the prepared URLs and recipients without sending anything. Do not run the submission flag without fresh authorization; the owner chose manual setup.

### Acceptance and backup restore

Run `npm test`, `npm run lint`, `npm run build`, the Deno check over all Edge entrypoints, `npm audit --audit-level=moderate`, `npm run test:security`, `npm run test:load`, and `npm run test:restore`. Captured evidence is in `validation/production-polish/`.

The load harness runs ten independent visitors against real application handlers and real isolated PostgreSQL with a stubbed model. It does not establish paid Gemini/Groq capacity. The physical local backup rehearsal restores synthetic database records and Storage metadata; it does not restore hosted customer backups or private object bytes. Restore those separately into isolated staging before relying on production recovery.

Staff acceptance must cover enrollment during a network loss, one-time backup recovery with revoked old sessions, a second current admin approving a disposable deletion, stale/self approvals rejected, live badges without draft loss, real ZIP receipt, SLA first-response recording, redacted export and manual reminder approval. Confirm email-provider acceptance separately from delivery to each inbox. Never use a real customer deletion to make a test green.

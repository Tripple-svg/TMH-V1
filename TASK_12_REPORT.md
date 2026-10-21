# Task 12 — backend emails and UI polish

Branch: `feat/backend-emails-and-ui`, created from clean `dev` on 21 October 2026.

## Changes

Created:

- `supabase/functions/paystack-webhook/index.ts`: authenticates the raw request bytes with Paystack HMAC-SHA512, records successful Playbook purchases, and invokes the thank-you sender. Unrelated events/products are acknowledged without creating purchases.
- `supabase/functions/send-purchase-thankyou/index.ts`: service-role-only sender with the requested subject/copy, shop link, and reply-to address; checks the saved purchase before sending.
- `supabase/functions/send-flag-alert/index.ts`: service-role-only sender using database snapshots and the fixed recipients `francis.teamhaven@gmail.com` and `paschal.tmh@gmail.com`.
- `supabase/migrations/20261021000000_playbook_purchases.sql`: requested purchase columns, unique reference, private RLS/service-role grants, and `thankyou_sent` for replay handling. Amount is stored in **kobo**.
- `supabase/migrations/20261021000001_flag_alert_notifications.sql`: private notification outbox and atomic database trigger for actual status transitions into yellow/red. Repeated status saves and reason-only edits do not create additional team alerts.
- `tests/paystack-purchases.test.mjs`: 14 purchase/webhook/sender tests.
- `tests/flag-alerts.test.mjs`: 12 internal team-alert tests.
- `TASK_12_REPORT.md`: this report, setup instructions, and the complete migration SQL.

Modified:

- `supabase/functions/flag-user/index.ts`: dispatches pending team alerts after flag updates, retries failed deliveries, and independently attempts the existing yellow customer warning. Until the notification migration is applied, yellow/red updates return 503 before saving an unnotifiable transition.
- `supabase/config.toml`: disables gateway JWT checks for the three new functions; the webhook checks its signature and the senders check service-role authorization.
- `src/components/ShopSection.jsx`: shows ₦9,639 before checkout and replaces the green checkout pill with subdued zinc copy, “Secure checkout via Paystack.”
- `src/components/services/ServiceGrid.jsx`: uses Explore Web, Explore Growth, and Explore Content.
- `src/components/TestimonialsSection.jsx`: first carousel image remains eager; later carousel/review images load lazily.
- `tests/user-flags.test.mjs`: adds five alert integration/retry tests and models the outbox contract while preserving the existing moderation tests.

`src/components/haven/config/prompts.js` and `src/components/haven/context/HavenContext.jsx` are unchanged. The other previously protected files are unchanged too. Changes remain unstaged; no commit or push was run.

## Price and secrets

The user explicitly chose to **keep the ₦100 test charge**. `PAYSTACK_AMOUNT_KOBO` is still 10000; the initial card displays the requested retail price of ₦9,639. The webhook accepts both 10000 and 963900 kobo, matching the existing verifier.

The existing checkout public key is a **live** key. These ₦100 payments therefore use the Live environment. The backend requires the matching live `PAYSTACK_SECRET_KEY` and the existing `RESEND_API_KEY`. No new secret name or separate webhook signing secret is needed. No secret value was printed or written to this report.

## Validation

All local tests: **105 passed, 0 failed**. This includes signature tampering/raw UTF-8, supported and unrelated charges, duplicate/concurrent deliveries, original-buyer preservation, saved-delivery markers, sender authorization, email failures/retries, team recipients, status transitions, pending alert recovery, existing checkout behavior, and prior regression tests.

The earlier explicitly requested command was also rerun: `node --test tests/backend-tasks.test.mjs tests/booking-ui.test.mjs tests/playbook-ui.test.mjs`. Result: **18 passed, 0 failed**, no skipped/cancelled tests and no error output.

The production build passed. Its first sandboxed attempt encountered an EPERM while resolving `src/main.jsx`; rerunning with normal workspace access succeeded. The existing large-bundle warning remains.

Targeted ESLint comparison found no added diagnostics: ShopSection 4 → 4 existing errors, ServiceGrid 0 → 0, TestimonialsSection 3 → 3. `git diff --check` passed.

External services and database writes are mocked in local tests. The SQL migrations and real purchase/email delivery must be tested after manual setup. Durable delivery markers and stable Resend keys handle ordinary replays and retries; an accepted email followed by prolonged database-marker failures beyond Resend's 24-hour idempotency window can still be duplicated. [Resend idempotency](https://resend.com/changelog/idempotency-keys)

## Deployment results

Deployed to Supabase project `dkpoygkduktusrnsbpaq`:

| Function | Status | Version |
| --- | --- | --- |
| `send-purchase-thankyou` | ACTIVE | 1 |
| `paystack-webhook` | ACTIVE | 1 |
| `send-flag-alert` | ACTIVE | 1 |
| `flag-user` (updated) | ACTIVE | 2 |

The project has both required secret names, `PAYSTACK_SECRET_KEY` and `RESEND_API_KEY`. Their values were not printed. A live unauthenticated POST to each function returned HTTP 401 with `{"ok":false,"error":"Unauthorised"}`, confirming the deployed endpoints reject requests without their required credentials/signature.

Neither SQL migration was executed. Apply both manually before enabling the webhook or using yellow/red flag updates. Frontend deployment and Paystack Dashboard configuration remain manual. End-to-end payment and email delivery have not been exercised against the live services.

## Required manual setup

1. In Supabase SQL Editor, run both migration blocks below in order. Do this before enabling the Paystack webhook or testing flag changes.
2. Log in to the [Paystack Dashboard](https://dashboard.paystack.com/), open **Settings → API Keys & Webhooks**, and find **API Configuration — Live Mode**. Use this environment for the current live-key checkout, even while charging ₦100. [Paystack environment and key settings](https://support.paystack.com/en/articles/2123458)
3. Set **Live Webhook URL** to `https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/paystack-webhook` and click **Save Changes**. The value belongs in the Webhook URL field. The server validates Paystack's signature using `PAYSTACK_SECRET_KEY`. [Paystack webhook configuration](https://paystack.com/docs/payments/webhooks/)
4. Make a ₦100 Playbook purchase using an email you control. In **Developers → Webhooks**, select the Live environment and inspect its `charge.success` delivery; expect HTTP 200. Test and Live webhook histories/settings are separate. [Paystack delivery history](https://support.paystack.com/en/articles/10609026)
5. In Supabase, confirm one `playbook_purchases` row for the reference, normalized buyer email, `amount = 10000`, and `thankyou_sent = true`. Confirm the buyer receives “Your copy of The Unseen Playbook” and its link opens `https://themarketinghaven.xyz/#shop`.
6. Retry that same event from its Paystack webhook details. Confirm the row remains unique and the delivered email is not repeated in the ordinary replay case.
7. Change a test review from White to Yellow through `flag-user`: verify the existing buyer warning and one team alert to both team recipients. Change Yellow to Red and verify a fresh team alert. Re-save the same status or edit only its reason and confirm no new team notification is created.
8. Simulate a sender failure in a controlled test. The purchase or notification should stay pending; retry the original operation and confirm delivery succeeds. A team failure must not suppress the yellow buyer-warning attempt.
9. Preview the frontend locally: check the retail price before opening checkout, muted checkout note, all three service button labels, and eager first/lazy later testimonial images. The actual charge intentionally remains ₦100.

No frontend deployment, dashboard configuration, real payment, or real email send is performed as part of the deployment smoke checks.

## SQL to run manually

The exact contents of both migration files follow.

### Purchase tracking

```sql
CREATE TABLE public.playbook_purchases (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reference text not null unique,
  amount numeric,
  created_at timestamptz not null default now(),
  thankyou_sent boolean not null default false
);

COMMENT ON COLUMN public.playbook_purchases.amount IS 'Paystack transaction amount in kobo (NGN minor units).';

ALTER TABLE public.playbook_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.playbook_purchases FROM anon, authenticated;
GRANT ALL ON public.playbook_purchases TO service_role;
```

### Flag notifications

```sql
-- Apply before testing or using the updated flag-user function.
-- Each actual transition to yellow/red creates one durable team notification.
CREATE TABLE public.flag_alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id TEXT NOT NULL REFERENCES public.brand_reviews(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('yellow', 'red')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX flag_alert_notifications_pending_review_idx
  ON public.flag_alert_notifications (review_id, created_at)
  WHERE sent_at IS NULL;

ALTER TABLE public.flag_alert_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.flag_alert_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.flag_alert_notifications TO service_role;
CREATE POLICY service_all_flag_alert_notifications
  ON public.flag_alert_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE FUNCTION public.queue_flag_alert_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Reason edits and repeated requests with the same status must not send new alerts.
  IF OLD.flag_status IS DISTINCT FROM NEW.flag_status
     AND NEW.flag_status IN ('yellow', 'red') THEN
    INSERT INTO public.flag_alert_notifications (review_id, email, status, reason)
    VALUES (NEW.id, NEW.email, NEW.flag_status, NEW.flag_reason);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER queue_flag_alert_notification
AFTER UPDATE ON public.brand_reviews
FOR EACH ROW EXECUTE FUNCTION public.queue_flag_alert_notification();
```

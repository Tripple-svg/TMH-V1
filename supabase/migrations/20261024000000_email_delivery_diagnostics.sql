begin;
alter table public.flag_alert_notifications
  add column if not exists team_attempted_at timestamptz,
  add column if not exists team_last_error text,
  add column if not exists team_email_id text,
  add column if not exists customer_attempted_at timestamptz,
  add column if not exists customer_last_error text,
  add column if not exists customer_email_id text;
-- No browser grants: this outbox remains protected by its existing RLS.
commit;

begin;
-- Existing pending work keeps its exact original payload/idempotency key.
alter table public.playbook_purchases add column if not exists email_template_version text not null default 'legacy';
alter table public.playbook_purchases alter column email_template_version set default 'editorial-v1';
alter table public.flag_alert_notifications add column if not exists email_template_version text not null default 'legacy';
alter table public.flag_alert_notifications alter column email_template_version set default 'editorial-v1';
alter table public.brand_reviews
  add column if not exists welcome_email_id text,
  add column if not exists welcome_email_attempted_at timestamptz,
  add column if not exists welcome_email_last_error text;
commit;

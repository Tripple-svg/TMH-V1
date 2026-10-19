-- Cron scheduling for calendly-poll-bookings
--
-- BEFORE RUNNING:
--   1. Add INTERNAL_POLL_SECRET to Supabase secrets (see Section 6)
--   2. Replace the placeholder below with the actual secret value
--
-- Run this file manually in the Supabase SQL Editor. Do not use db push
-- to apply this migration automatically.
-- To disable: SELECT cron.unschedule('calendly-poll-bookings');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'calendly-poll-bookings',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/calendly-poll-bookings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-poll-key', 'REPLACE_WITH_INTERNAL_POLL_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

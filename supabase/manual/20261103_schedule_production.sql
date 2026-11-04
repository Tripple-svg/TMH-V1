-- Run after the new functions are deployed and the existing Vault secret is verified.
-- The health endpoint stays 503 until four real workers have succeeded.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname='tmh-lead-followup-nudges';
select cron.schedule('tmh-lead-followup-nudges','*/5 * * * *',$cron$
  select net.http_post(
    url:='https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/send-lead-followup-nudges',
    headers:=jsonb_build_object('Content-Type','application/json','x-internal-poll-key',
      (select decrypted_secret from vault.decrypted_secrets where name='tmh_internal_poll_secret' limit 1)),body:='{}'::jsonb);
$cron$);
select cron.unschedule(jobid) from cron.job where jobname='tmh-production-private-retention';
select cron.schedule('tmh-production-private-retention','23 3 * * *',$cron$
  select set_config('request.jwt.claim.role','service_role',true);
  select public.production_private_retention();
  select public.expire_content_performance();
$cron$);
-- Existing calendly-poll-bookings, tmh-support-notifications and
-- tmh-ai-usage-alerts must remain active at intervals shorter than 15 minutes.

-- After deploying send-ai-usage-alerts, store INTERNAL_POLL_SECRET in Supabase
-- Vault under the name tmh_internal_poll_secret (same value as the Edge secret).
-- Never paste a service role key into a cron command or commit secrets.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname='tmh-ai-usage-alerts';
select cron.schedule('tmh-ai-usage-alerts','*/5 * * * *',$cron$
  select net.http_post(
    url:='https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/send-ai-usage-alerts',
    headers:=jsonb_build_object('Content-Type','application/json','x-internal-poll-key',
      (select decrypted_secret from vault.decrypted_secrets where name='tmh_internal_poll_secret' limit 1)),
    body:='{}'::jsonb
  );
$cron$);
select cron.unschedule(jobid) from cron.job where jobname='tmh-security-retention';
select cron.schedule('tmh-security-retention','17 3 * * *',$cron$
  delete from public.ai_usage_events where created_at<now()-interval '90 days';
  delete from public.ai_usage_alerts where sent_at<now()-interval '90 days';
  delete from public.verification_attempts where bucket like 'network:%' and updated_at<now()-interval '2 days';
$cron$);

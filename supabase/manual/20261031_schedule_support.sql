-- Run AFTER the support migration and Edge Function deployment. Store the same
-- INTERNAL_POLL_SECRET in Vault as tmh_internal_poll_secret. No API/service keys
-- belong in this script. Never expose the secret in screenshots or query output.
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $setup$
declare old_job record;
begin
  for old_job in select jobid from cron.job where jobname='tmh-support-notifications' loop
    perform cron.unschedule(old_job.jobid);
  end loop;
  if not exists(select 1 from vault.decrypted_secrets where name='tmh_internal_poll_secret' and length(decrypted_secret)>=32) then
    raise notice 'Support notifications not scheduled: configure tmh_internal_poll_secret in Vault, then rerun this script.';
    return;
  end if;
  perform cron.schedule('tmh-support-notifications','* * * * *',$cron$
    select net.http_post(
      url:='https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/send-support-notification',
      headers:=jsonb_build_object('Content-Type','application/json','x-internal-poll-key',
        (select decrypted_secret from vault.decrypted_secrets where name='tmh_internal_poll_secret' limit 1)),
      body:='{}'::jsonb
    );
  $cron$);
end;
$setup$;
-- Retention is independent of outbound mail configuration.
select cron.unschedule(jobid) from cron.job where jobname='tmh-support-retention';
select cron.schedule('tmh-support-retention','31 3 * * *',$cron$
  delete from public.support_requests where status='resolved' and updated_at<now()-interval '90 days';
$cron$);
-- Inspect execution without returning secrets:
-- select jobname,schedule,active from cron.job where jobname like 'tmh-%';
-- select status,return_message,start_time from cron.job_run_details order by start_time desc limit 20;

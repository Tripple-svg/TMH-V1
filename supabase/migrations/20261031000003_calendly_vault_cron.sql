-- Supersedes the historical cron migration's literal secret placeholder.
-- Safe to apply before Vault is configured: the old job is removed and the
-- poller is left unscheduled until this script is rerun after setup.
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $setup$
declare old_job record;
begin
  for old_job in select jobid from cron.job where jobname='calendly-poll-bookings' loop
    perform cron.unschedule(old_job.jobid);
  end loop;
  if not exists(select 1 from vault.decrypted_secrets where name='tmh_internal_poll_secret' and length(decrypted_secret)>=32) then
    raise notice 'Calendly poller not scheduled: configure tmh_internal_poll_secret in Vault, then rerun this migration SQL.';
    return;
  end if;
  perform cron.schedule('calendly-poll-bookings','*/5 * * * *',$job$
    select net.http_post(
      url:='https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/calendly-poll-bookings',
      headers:=jsonb_build_object('Content-Type','application/json','x-internal-poll-key',
        (select decrypted_secret from vault.decrypted_secrets where name='tmh_internal_poll_secret' limit 1)),
      body:='{}'::jsonb
    );
  $job$);
end;
$setup$;

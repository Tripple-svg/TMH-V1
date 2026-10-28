-- Run once AFTER the Oct 27 migrations and worker deployment.
-- Enable Supabase Cron (pg_cron), pg_net, and Vault in the dashboard first.
-- In Vault create these named secrets without pasting their values into Git:
--   tmh_project_url: the project's https://<ref>.supabase.co URL
--   tmh_internal_service_key: the SUPABASE_SERVICE_ROLE_KEY used by the worker
-- The Vault key is server-only. Never use VITE_* or the public anon key here.
-- One minute polling makes a message eligible 24h after payment; queue/provider
-- delays can affect acceptance and inbox arrival. This does not promise exact delivery.
do $$
begin
  if not exists(select 1 from pg_extension where extname='pg_cron')
     or not exists(select 1 from pg_extension where extname='pg_net') then
    raise exception 'Enable Supabase Cron and pg_net first';
  end if;
  if (select count(*) from vault.decrypted_secrets where name in ('tmh_project_url','tmh_internal_service_key'))<>2 then
    raise exception 'Create the two named Vault secrets first';
  end if;
  if exists(select 1 from vault.decrypted_secrets where name='tmh_project_url' and decrypted_secret !~ '^https://[a-z0-9]+\.supabase\.co/?$') then
    raise exception 'Check the project URL in Vault';
  end if;
  if exists(select 1 from cron.job where jobname='tmh-playbook-followup-every-minute') then
    perform cron.unschedule('tmh-playbook-followup-every-minute');
  end if;
  perform cron.schedule('tmh-playbook-followup-every-minute','* * * * *',$job$
    select net.http_post(
      url := (select rtrim(decrypted_secret,'/') from vault.decrypted_secrets where name='tmh_project_url')||'/functions/v1/send-purchase-followup',
      headers := jsonb_build_object('Content-Type','application/json','x-haven-internal-key',
        (select decrypted_secret from vault.decrypted_secrets where name='tmh_internal_service_key')),
      body := '{}'::jsonb,
      -- Five sequential provider requests can each use their 15-second timeout.
      -- Keep the HTTP wait inside the worker's two-minute claim lease.
      timeout_milliseconds := 110000
    );
  $job$);
end $$;

-- Read-only checks after setup:
select jobid,jobname,schedule,active from cron.job where jobname='tmh-playbook-followup-every-minute';
-- Inspect cron.job_run_details and net._http_response privately for failures.
-- To disable: select cron.unschedule('tmh-playbook-followup-every-minute');

-- Apply the privacy migration first. No secret or provider call is required.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname='tmh-private-content-retention';
select cron.schedule('tmh-private-content-retention','43 3 * * *',$cron$
  select set_config('request.jwt.claim.role','service_role',true);
  select public.expire_inactive_haven_content();
  delete from public.site_presence_visitors where last_seen<now()-interval '13 months';
$cron$);

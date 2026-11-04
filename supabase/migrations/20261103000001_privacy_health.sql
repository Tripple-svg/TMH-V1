begin;
create table public.data_export_requests (
  id uuid primary key default gen_random_uuid(),email text not null,token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours',
  snapshot jsonb,first_attempt_at timestamptz,accepted_at timestamptz,email_id text
);
alter table public.data_export_requests enable row level security;
revoke all on public.data_export_requests from public,anon,authenticated;
grant all on public.data_export_requests to service_role;
create function public.prepare_data_export(p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.data_export_requests; data jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  select * into r from public.data_export_requests where token_hash=p_hash for update;
  if not found or r.expires_at<=now() or r.accepted_at is not null or r.first_attempt_at<=now()-interval '23 hours' then return jsonb_build_object('unavailable',true);end if;
  if r.snapshot is null then
    select jsonb_build_object('exportedAt',r.created_at,'scope','Matching saved reviews and linked chats. Ask Support about other records.',
      'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.full_name,'brand',b.brand_name,'email',b.email,'phone',b.whatsapp,
        'website',b.website_url,'social',b.social_link,'score',b.haven_score,'scoreBreakdown',b.score_breakdown,'assessment',b.assessment_summary,'createdAt',b.created_at))
        from public.brand_reviews b where lower(b.email)=lower(r.email)),'[]'),
      'conversations',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'scope',s.scope,'createdAt',s.created_at,'messages',
        (select coalesce(jsonb_agg(jsonb_build_object('role',m->>'role','content',m->>'content','timestamp',m->'timestamp')),'[]') from jsonb_array_elements(coalesce(s.messages,'[]')) m)))
        from public.haven_sessions s join public.brand_reviews b on b.id=s.review_id where lower(b.email)=lower(r.email)),'[]')) into data;
    -- Bounded email attachment. Larger requests use a human-verified process.
    if octet_length(data::text)>4000000 then return jsonb_build_object('tooLarge',true);end if;
    update public.data_export_requests set snapshot=data,first_attempt_at=now() where id=r.id returning * into r;
  end if;
  return jsonb_build_object('id',r.id,'email',r.email,'snapshot',r.snapshot);
end; $$;
revoke all on function public.prepare_data_export(text) from public,anon,authenticated;
grant execute on function public.prepare_data_export(text) to service_role;

create table public.operations_heartbeats(name text primary key,succeeded_at timestamptz not null default now());
alter table public.operations_heartbeats enable row level security;
revoke all on public.operations_heartbeats from public,anon,authenticated;
grant all on public.operations_heartbeats to service_role;
create function public.record_worker_success(p_name text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  if p_name not in ('calendly-poll-bookings','send-support-notification','send-ai-usage-alerts','send-lead-followup-nudges') then raise exception 'Unknown worker';end if;
  insert into public.operations_heartbeats(name) values(p_name) on conflict(name) do update set succeeded_at=now();return true;
end; $$;
create function public.production_health_checks() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare secret_ok boolean:=false;cron_ok boolean:=false;worker_ok boolean:=false;rpc_ok boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  rpc_ok:=to_regprocedure('public.admin_access_allowed(uuid,text,uuid)') is not null and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='reserve_ai_budget');
  begin execute $q$select count(*)=1 and bool_and(length(decrypted_secret)>=32) from vault.decrypted_secrets where name='tmh_internal_poll_secret'$q$ into secret_ok;exception when others then secret_ok:=false;end;
  begin execute $q$select count(*)=4 and bool_and(j.active and exists(select 1 from cron.job_run_details d where d.jobid=j.jobid and d.status='succeeded' and d.end_time>now()-interval '15 minutes')) from cron.job j where j.jobname in ('calendly-poll-bookings','tmh-support-notifications','tmh-ai-usage-alerts','tmh-lead-followup-nudges')$q$ into cron_ok;exception when others then cron_ok:=false;end;
  select count(*)=4 and bool_and(succeeded_at>now()-interval '15 minutes') into worker_ok from public.operations_heartbeats where name in ('calendly-poll-bookings','send-support-notification','send-ai-usage-alerts','send-lead-followup-nudges');
  return jsonb_build_object('database',true,'rpc',coalesce(rpc_ok,false),'vault',coalesce(secret_ok,false),'cron',coalesce(cron_ok,false),'workers',coalesce(worker_ok,false));
end; $$;
revoke all on function public.record_worker_success(text),public.production_health_checks() from public,anon,authenticated;
grant execute on function public.record_worker_success(text),public.production_health_checks() to service_role;
create function public.production_private_retention() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  delete from public.admin_login_events where occurred_at<now()-interval '30 days';
  delete from public.admin_login_devices where last_seen<now()-interval '30 days';
  delete from public.admin_backup_codes where consumed_at<now()-interval '30 days';
  delete from public.admin_live_notifications where created_at<now()-interval '7 days';
  delete from public.data_export_requests where expires_at<now() or accepted_at<now()-interval '1 day';
end; $$;
revoke all on function public.production_private_retention() from public,anon,authenticated;
grant execute on function public.production_private_retention() to service_role;
commit;

begin;

-- New operations never grant browser writes. The Edge layer verifies the JWT
-- and AAL; SQL rechecks current staff membership while holding the Auth row.
create function public.production_admin_actor(p_actor uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  perform 1 from auth.users where id=p_actor and raw_app_meta_data->>'role'='admin'
    and deleted_at is null and (banned_until is null or banned_until<=now()) for share;
  if not found then raise exception 'Current admin required' using errcode='42501'; end if;
end; $$;
revoke all on function public.production_admin_actor(uuid) from public,anon,authenticated,service_role;
create function public.admin_recovery_allowed(p_actor uuid,p_session uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.production_admin_actor(p_actor);return exists(select 1 from auth.sessions where id=p_session and user_id=p_actor);end; $$;
revoke all on function public.admin_recovery_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_recovery_allowed(uuid,uuid) to service_role;
-- Revoked refresh sessions must also stop already-issued access JWTs after MFA
-- recovery. Auth getUser verifies signatures; it does not revoke JWT expiry.
create function public.admin_access_allowed(p_actor uuid,p_aal text,p_session uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.admin_access_allowed(p_actor,p_aal) and exists(select 1 from auth.sessions where id=p_session and user_id=p_actor);
$$;
revoke all on function public.admin_access_allowed(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_access_allowed(uuid,text,uuid) to service_role;
create or replace function public.is_tmh_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=auth.uid() and s.id::text=auth.jwt()->>'session_id'
    and u.raw_app_meta_data->>'role'='admin' and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
    and (coalesce(auth.jwt()->>'aal','aal1')='aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified')));
$$;

create table public.admin_login_devices (
  actor_id uuid not null, combo_hash text not null check(combo_hash~'^[a-f0-9]{64}$'),
  device text not null check(length(device)<=200), ip_address text not null check(length(ip_address)<=64),
  city text check(length(city)<=120), first_seen timestamptz not null default now(), last_seen timestamptz not null default now(),
  alert_generation uuid not null default gen_random_uuid(), alert_first_attempt_at timestamptz,alert_accepted_at timestamptz,
  primary key(actor_id,combo_hash)
);
create table public.admin_login_events (
  id uuid primary key default gen_random_uuid(),actor_id uuid not null, session_id uuid not null,
  device text not null,ip_address text not null,city text,occurred_at timestamptz not null default now(),
  unique(actor_id,session_id)
);
create index admin_login_recent on public.admin_login_events(occurred_at desc);
create table public.admin_backup_codes (
  actor_id uuid not null,code_hash text not null check(code_hash~'^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),consumed_at timestamptz,
  primary key(actor_id,code_hash)
);
create table public.admin_deletion_approvals (
  id uuid primary key default gen_random_uuid(),record_type text not null check(record_type in ('review','purchase')),
  record_id text not null,requested_by uuid not null,approved_by uuid,
  reason text not null check(length(trim(reason)) between 10 and 500),snapshot_hash text not null,
  created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours',
  executed_at timestamptz,cleanup_path text,cleanup_completed_at timestamptz,
  check(approved_by is null or approved_by<>requested_by)
);
create unique index admin_deletion_pending on public.admin_deletion_approvals(record_type,record_id) where executed_at is null;
create table public.admin_followup_nudges (
  review_id text primary key references public.brand_reviews(id) on delete cascade,
  due_at timestamptz not null,approved_by uuid,approved_at timestamptz,
  first_attempt_at timestamptz,accepted_at timestamptz,email_id text
);
create table public.admin_live_notifications (
  id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('support','booking')),
  created_at timestamptz not null default now()
);
-- Realtime carries only an opaque event, never a support message or booking PII.
alter table public.admin_live_notifications enable row level security;
revoke all on public.admin_live_notifications from public,anon,authenticated;
grant select on public.admin_live_notifications to authenticated;
grant all on public.admin_live_notifications to service_role;
create policy staff_live_read on public.admin_live_notifications for select to authenticated using(public.is_tmh_admin());
create function public.notify_admin_arrival() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin insert into public.admin_live_notifications(kind) values(case when TG_TABLE_NAME='support_requests' then 'support' else 'booking' end);return new;end; $$;
revoke all on function public.notify_admin_arrival() from public,anon,authenticated,service_role;
create trigger support_live_arrival after insert on public.support_requests for each row execute function public.notify_admin_arrival();
create trigger booking_live_arrival after insert on public.strategy_call_bookings for each row execute function public.notify_admin_arrival();
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.admin_live_notifications;
  end if;
end; $$;

alter table public.support_requests add column first_response_at timestamptz;

do $$ declare name text;begin
  foreach name in array array['admin_login_devices','admin_login_events','admin_backup_codes','admin_deletion_approvals','admin_followup_nudges'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('grant all on public.%I to service_role',name);
  end loop;
end; $$;

create function public.record_admin_login(p_actor uuid,p_session uuid,p_combo text,p_device text,p_ip text,p_city text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.admin_login_devices; fresh boolean:=false;
begin
  perform public.production_admin_actor(p_actor);
  if p_session is null or p_combo!~'^[a-f0-9]{64}$' or p_device is null or length(p_device)>200 or p_ip is null or length(p_ip)>64 or length(p_city)>120 then raise exception 'Invalid login context';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_combo,0));
  select * into item from public.admin_login_devices where actor_id=p_actor and combo_hash=p_combo for update;
  fresh:=not found or item.last_seen<now()-interval '30 days';
  insert into public.admin_login_devices(actor_id,combo_hash,device,ip_address,city) values(p_actor,p_combo,p_device,p_ip,p_city)
    on conflict(actor_id,combo_hash) do update set last_seen=now(),city=coalesce(excluded.city,admin_login_devices.city),
      alert_generation=case when fresh then gen_random_uuid() else admin_login_devices.alert_generation end,
      alert_first_attempt_at=case when fresh then null else admin_login_devices.alert_first_attempt_at end,
      alert_accepted_at=case when fresh then null else admin_login_devices.alert_accepted_at end;
  insert into public.admin_login_events(actor_id,session_id,device,ip_address,city) values(p_actor,p_session,p_device,p_ip,p_city) on conflict do nothing;
  select * into item from public.admin_login_devices where actor_id=p_actor and combo_hash=p_combo;
  if item.alert_accepted_at is null and (item.alert_first_attempt_at is null or item.alert_first_attempt_at>now()-interval '23 hours') then
    update public.admin_login_devices set alert_first_attempt_at=coalesce(alert_first_attempt_at,now()) where actor_id=p_actor and combo_hash=p_combo;
    return jsonb_build_object('alert',true,'generation',item.alert_generation);
  end if;
  return jsonb_build_object('alert',false);
end; $$;

create function public.replace_admin_backup_codes(p_actor uuid,p_hashes text[],p_network text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.production_admin_actor(p_actor);
  if cardinality(p_hashes)<>10 or exists(select 1 from unnest(p_hashes) h where h is null or h!~'^[a-f0-9]{64}$')
    or (select count(distinct h) from unnest(p_hashes) h)<>10 or p_network!~'^[a-f0-9]{64}$' then raise exception 'Invalid recovery codes';end if;
  if not exists(select 1 from auth.mfa_factors where user_id=p_actor and status='verified') then raise exception 'Verified factor required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  delete from public.admin_backup_codes where actor_id=p_actor;
  insert into public.admin_backup_codes(actor_id,code_hash) select p_actor,h from unnest(p_hashes) h;
  insert into public.admin_audit_events(actor_id,action,record_type,record_id,network_hash,outcome) values(p_actor,'mfa_backup_generated','admin',p_actor::text,p_network,'applied');
  return true;
end; $$;
create function public.consume_admin_backup_code(p_actor uuid,p_hash text,p_network text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.production_admin_actor(p_actor);
  if p_network!~'^[a-f0-9]{64}$' then raise exception 'Invalid recovery context';end if;
  update public.admin_backup_codes set consumed_at=now() where actor_id=p_actor and code_hash=p_hash and consumed_at is null;
  if not found then return false;end if;
  insert into public.admin_audit_events(actor_id,action,record_type,record_id,network_hash,outcome) values(p_actor,'mfa_backup_consumed','admin',p_actor::text,p_network,'applied');
  return true;
end; $$;

-- Block the old single-admin path in SQL as well as in the API.
alter function public.run_admin_mutation(uuid,text,text,text,jsonb) rename to run_admin_mutation_before_approvals;
revoke all on function public.run_admin_mutation_before_approvals(uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.run_admin_mutation(p_actor uuid,p_network_hash text,p_action text,p_record_id text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.production_admin_actor(p_actor);
  if p_action='review_delete' then raise exception 'Second admin approval required' using errcode='42501';end if;
  return public.run_admin_mutation_before_approvals(p_actor,p_network_hash,p_action,p_record_id,p_payload);
end; $$;

create function public.request_admin_deletion(p_actor uuid,p_kind text,p_id text,p_reason text,p_network text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare snapshot text; item public.admin_deletion_approvals;
begin
  perform public.production_admin_actor(p_actor);
  if p_kind not in ('review','purchase') or p_id is null or length(p_id)>200 or p_reason is null or length(trim(p_reason)) not between 10 and 500 or p_network!~'^[a-f0-9]{64}$' then raise exception 'Invalid deletion request';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_kind||p_id,0));
  if p_kind='review' then select md5(to_jsonb(r)::text) into snapshot from public.brand_reviews r where id=p_id for update;
  else select md5(to_jsonb(r)::text) into snapshot from public.playbook_purchases r where id::text=p_id for update;end if;
  if snapshot is null then return jsonb_build_object('missing',true);end if;
  delete from public.admin_deletion_approvals where record_type=p_kind and record_id=p_id and executed_at is null and (expires_at<=now() or snapshot_hash<>snapshot);
  insert into public.admin_deletion_approvals(record_type,record_id,requested_by,reason,snapshot_hash) values(p_kind,p_id,p_actor,trim(p_reason),snapshot)
    on conflict(record_type,record_id) where executed_at is null do nothing;
  select * into item from public.admin_deletion_approvals where record_type=p_kind and record_id=p_id and executed_at is null;
  insert into public.admin_audit_events(actor_id,action,record_type,record_id,network_hash,outcome) values(p_actor,'deletion_requested',p_kind,p_id,p_network,'requested');
  return jsonb_build_object('pendingApproval',true,'approvalId',item.id);
end; $$;
create function public.approve_admin_deletion(p_actor uuid,p_id uuid,p_network text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.admin_deletion_approvals;snapshot text;result jsonb;ref text;
begin
  perform public.production_admin_actor(p_actor);
  if p_network!~'^[a-f0-9]{64}$' then raise exception 'Invalid audit context';end if;
  select * into item from public.admin_deletion_approvals where id=p_id for update;
  if not found or item.executed_at is not null or item.expires_at<=now() then return jsonb_build_object('unavailable',true);end if;
  if item.requested_by=p_actor then raise exception 'A different admin must approve' using errcode='42501';end if;
  perform public.production_admin_actor(item.requested_by);
  if item.record_type='review' then select md5(to_jsonb(r)::text) into snapshot from public.brand_reviews r where id=item.record_id for update;
  else select md5(to_jsonb(r)::text),reference into snapshot,ref from public.playbook_purchases r where id::text=item.record_id for update;end if;
  if snapshot is distinct from item.snapshot_hash then return jsonb_build_object('conflict',true);end if;
  if item.record_type='review' then
    result:=public.admin_delete_lead(item.record_id);
    if coalesce(result->>'screenshot_path','')<>'' and (left(result->>'screenshot_path',length(item.record_id)+1)<>item.record_id||'/' or '..'=any(string_to_array(result->>'screenshot_path','/'))) then raise exception 'Invalid screenshot path';end if;
  else
    delete from public.playbook_download_grants where reference=ref;
    delete from public.playbook_recovery_otps where reference=ref;
    delete from public.playbook_purchases where id::text=item.record_id;
    result:=jsonb_build_object('deleted',true);
  end if;
  update public.admin_deletion_approvals set approved_by=p_actor,executed_at=now(),cleanup_path=result->>'screenshot_path' where id=p_id;
  insert into public.admin_audit_events(actor_id,action,record_type,record_id,network_hash,outcome) values(p_actor,'deletion_approved',item.record_type,item.record_id,p_network,'applied');
  return jsonb_build_object('deleted',true,'recordType',item.record_type,'recordId',item.record_id,'cleanupPath',result->>'screenshot_path');
end; $$;

-- Persist the actual window/threshold, so the dashboard never guesses reset times.
alter table public.playbook_security_limits add column max_requests integer,add column window_seconds integer;
create or replace function public.consume_playbook_limit(p_bucket text,p_max integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  if p_bucket is null or length(p_bucket)>160 or p_max not between 1 and 100 or p_seconds not between 1 and 86400 then raise exception 'Invalid limit';end if;
  insert into public.playbook_security_limits(bucket,max_requests,window_seconds) values(p_bucket,p_max,p_seconds)
  on conflict(bucket) do update set
    requests=case when playbook_security_limits.started_at<=now()-make_interval(secs=>p_seconds) then 1 else playbook_security_limits.requests+1 end,
    started_at=case when playbook_security_limits.started_at<=now()-make_interval(secs=>p_seconds) then now() else playbook_security_limits.started_at end,
    max_requests=p_max,window_seconds=p_seconds returning requests into n;
  return n<=p_max;
end; $$;
create function public.admin_active_limits(p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.production_admin_actor(p_actor);
  return coalesce((select jsonb_agg(to_jsonb(r)) from (
    select bucket as id,split_part(bucket,':',1) as reason,'Hashed network or device'::text as identity_type,
      requests,started_at+make_interval(secs=>window_seconds) as reset_at
    from public.playbook_security_limits where requests>=max_requests and started_at+make_interval(secs=>window_seconds)>now()
    union all select 'verification:'||visitor_id,'verification','Saved browser',attempts,cooldown_until
    from public.verification_attempts where visitor_id is not null and (locked_at is not null or cooldown_until>now())
    order by reset_at nulls last limit 200
  ) r),'[]'::jsonb);
end; $$;
create function public.clear_admin_limit(p_actor uuid,p_id text,p_reason text,p_network text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.production_admin_actor(p_actor);
  if p_reason is null or length(trim(p_reason)) not between 10 and 500 or length(p_id)>200 or p_network!~'^[a-f0-9]{64}$' then raise exception 'Invalid clear request';end if;
  if left(p_id,13)='verification:' then update public.verification_attempts set attempts=0,locked_at=null,cooldown_until=null where visitor_id=substr(p_id,14);
  else delete from public.playbook_security_limits where bucket=p_id;end if;
  insert into public.admin_audit_events(actor_id,action,record_type,record_id,network_hash,changed_fields,outcome) values(p_actor,'rate_limit_cleared','rate_limit',p_id,p_network,array['attempts'],'applied');
  return true;
end; $$;

create function public.mark_support_response(p_actor uuid,p_id uuid,p_revision integer,p_network text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.production_admin_actor(p_actor);
  if p_network!~'^[a-f0-9]{64}$' then raise exception 'Invalid context';end if;
  update public.support_requests set first_response_at=coalesce(first_response_at,now()),revision=revision+1,updated_at=now() where id=p_id and revision=p_revision;
  if not found then return false;end if;
  insert into public.admin_audit_events(actor_id,action,record_type,record_id,network_hash,outcome) values(p_actor,'support_response_recorded','support',p_id::text,p_network,'applied');return true;
end; $$;

create function public.refresh_lead_followup_nudges() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  insert into public.admin_followup_nudges(review_id,due_at) select id,created_at+interval '3 days' from public.brand_reviews
    where coalesce(followup_status,'pending')='pending' and created_at<=now()-interval '3 days' on conflict do nothing;
  get diagnostics n=row_count;return n;
end; $$;
create function public.approve_lead_nudge(p_actor uuid,p_id text,p_network text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.production_admin_actor(p_actor);
  if p_network!~'^[a-f0-9]{64}$' then raise exception 'Invalid context';end if;
  update public.admin_followup_nudges n set approved_by=p_actor,approved_at=now() where n.review_id=p_id and approved_at is null and due_at<=now()
    and exists(select 1 from public.brand_reviews r where r.id=p_id and coalesce(r.followup_status,'pending')='pending');
  if not found then return false;end if;
  insert into public.admin_audit_events(actor_id,action,record_type,record_id,network_hash,outcome) values(p_actor,'lead_nudge_approved','review',p_id,p_network,'applied');return true;
end; $$;
create function public.claim_lead_nudges() returns setof public.admin_followup_nudges language sql security definer set search_path=public,pg_temp as $$
  update public.admin_followup_nudges set first_attempt_at=coalesce(first_attempt_at,now()) where auth.role()='service_role' and review_id in (
    select n.review_id from public.admin_followup_nudges n join public.brand_reviews r on r.id=n.review_id
    where n.approved_at is not null and n.accepted_at is null and coalesce(r.followup_status,'pending')='pending'
      and (n.first_attempt_at is null or n.first_attempt_at>now()-interval '23 hours') limit 20 for update of n skip locked
  ) returning *;
$$;

-- Only aggregated output: no transcript excerpts, names or account identifiers.
-- First turns are classified into safe templates. Rare/free-form text is never returned.
create function public.admin_insights(p_actor uuid,p_days integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  perform public.production_admin_actor(p_actor);
  if p_days not in (7,30) then raise exception 'Choose 7 or 30 days';end if;
  with sessions as (select * from public.haven_sessions where created_at>=now()-make_interval(days=>p_days)),
  first_turns as (select case
    when lower(m.content)~'playbook|chapter|book' then 'Playbook guidance'
    when lower(m.content)~'call|meeting|book a' then 'Call or booking'
    when lower(m.content)~'download|payment|access|error|help|support' then 'Access or support'
    when lower(m.content)~'brand|marketing|business|sales|customer' then 'Brand or marketing'
    else 'Other opening' end as topic
    from sessions s cross join lateral (select value->>'content' content from jsonb_array_elements(coalesce(s.messages,'[]')) with ordinality a(value,n) where value->>'role'='user' order by n limit 1) m),
  topics as (select topic,count(*) total from first_turns group by topic order by total desc limit 5),
  reviews as (select * from public.brand_reviews where created_at>=now()-make_interval(days=>p_days)),
  leaks as (select case when lower(biggest_leak)~'trust' then 'Trust' when lower(biggest_leak)~'friction|conversion' then 'Friction'
    when lower(biggest_leak)~'position' then 'Positioning' when lower(biggest_leak)~'clarity|clear' then 'Clarity' else 'Unclassified' end label,count(*) total from reviews group by 1)
  select jsonb_build_object('days',p_days,'conversations',(select count(*) from sessions),
    'routed',(select count(*) from sessions where current_step in ('ROUTING_TO_PLAYBOOK','ROUTING_TO_CALL','ROUTING_TO_CONTENT') or last_step_reached in ('ROUTING_TO_PLAYBOOK','ROUTING_TO_CALL','ROUTING_TO_CONTENT') or messages::text~'\[\[(PLAYBOOK|BOOK_CALL|TIKTOK_CONTENT)\]\]'),
    'reviews',(select count(*) from reviews),'playbookClicks',(select count(*) from reviews where clicked_playbook_link is true),
    'callClicks',(select count(*) from reviews where clicked_booking_link is true),'leaks',coalesce((select jsonb_agg(to_jsonb(leaks)) from leaks),'[]'),
    'firstTurns',coalesce((select jsonb_agg(to_jsonb(topics)) from topics),'[]')) into result;
  return result;
end; $$;

do $$ declare fn record;begin
  for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('record_admin_login','replace_admin_backup_codes','consume_admin_backup_code','run_admin_mutation',
      'request_admin_deletion','approve_admin_deletion','admin_active_limits','clear_admin_limit','mark_support_response',
      'refresh_lead_followup_nudges','approve_lead_nudge','claim_lead_nudges','admin_insights') loop
    execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end; $$;
commit;

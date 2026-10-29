begin;

-- Existing pending confirmations retain their original provider payload/key.
alter table public.booking_intents add column booking_email_version text not null default 'legacy-v1';
alter table public.booking_intents alter column booking_email_version set default 'editorial-v3';
alter table public.brand_reviews add column booking_email_version text not null default 'legacy-v1';
alter table public.brand_reviews alter column booking_email_version set default 'editorial-v3';
alter table public.strategy_call_bookings add column booking_email_version text not null default 'legacy-v1';
alter table public.strategy_call_bookings alter column booking_email_version set default 'editorial-v3';

create function public.strategy_booking_confirmation(p_invitee_uri text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  return (select jsonb_build_object('id',id,'booking_email_version',booking_email_version,'confirmation_email_sent',confirmation_email_sent)
    from public.strategy_call_bookings where invitee_uri=p_invitee_uri);
end; $$;

create table public.booking_confirmation_emails (
  id text primary key, payload jsonb not null, provider_email_id text,
  attempted_at timestamptz, sent_at timestamptz, last_error text
);

create function public.prepare_booking_confirmation(p_id text, p_payload jsonb)
returns public.booking_confirmation_emails language plpgsql security invoker set search_path=public,pg_temp as $$
declare result public.booking_confirmation_emails;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  insert into public.booking_confirmation_emails(id,payload) values(p_id,p_payload) on conflict(id) do nothing;
  update public.booking_confirmation_emails set attempted_at=now(),last_error=null where id=p_id returning * into result;
  return result;
end; $$;

create table public.team_assignments (
  id uuid primary key default gen_random_uuid(),
  booking_id bigint unique references public.strategy_call_bookings(id) on delete cascade,
  inquiry_id text unique references public.haven_sessions(id) on delete cascade,
  assignee_name text not null check(length(assignee_name) between 1 and 80),
  assignee_email text not null check(length(assignee_email) between 3 and 254),
  preparation_note text not null default '' check(length(preparation_note)<=2000),
  revision integer not null default 1 check(revision>0),
  expires_at timestamptz not null default now()+interval '7 days',
  revoked_at timestamptz, acknowledged_at timestamptz,
  email_payload jsonb, email_first_attempt_at timestamptz, email_attempted_at timestamptz, email_sent_at timestamptz,
  provider_email_id text, email_last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(num_nonnulls(booking_id,inquiry_id)=1)
);

create function public.save_team_assignment(p_kind text,p_target text,p_revision integer,p_name text,p_email text,p_note text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare item public.team_assignments; target_lock text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_kind not in ('booking','inquiry') or p_revision<0 or p_revision is null
    or p_name not in ('Francis Fadeyi','Paschal Ikiriko','Great Jordan','Obabi Babalola','Yakubu Dalil')
    or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_note is null or length(p_note)>2000 then raise exception 'Invalid assignment' using errcode='22023'; end if;
  target_lock:=p_kind||'/'||p_target;
  perform pg_advisory_xact_lock(hashtextextended(target_lock,0));
  if p_kind='booking' then
    if not exists(select 1 from public.strategy_call_bookings where id=p_target::bigint and status in ('active','confirmed') and (end_time is null or end_time>now()))
      then raise exception 'Active upcoming booking required' using errcode='P0002'; end if;
    select * into item from public.team_assignments where booking_id=p_target::bigint for update;
  else
    if not exists(select 1 from public.haven_sessions where id=p_target and service_id='team-inquiry')
      then raise exception 'Team inquiry required' using errcode='P0002'; end if;
    select * into item from public.team_assignments where inquiry_id=p_target for update;
  end if;
  if coalesce(item.revision,0)<>p_revision then return jsonb_build_object('conflict',true); end if;
  if item.email_attempted_at>now()-interval '60 seconds' and item.email_sent_at is null
    then return jsonb_build_object('busy',true); end if;
  if item.id is null then
    insert into public.team_assignments(booking_id,inquiry_id,assignee_name,assignee_email,preparation_note)
    values(case when p_kind='booking' then p_target::bigint end,case when p_kind='inquiry' then p_target end,p_name,lower(trim(p_email)),p_note) returning * into item;
  else
    update public.team_assignments set assignee_name=p_name,assignee_email=lower(trim(p_email)),preparation_note=p_note,
      revision=revision+1,expires_at=now()+interval '7 days',revoked_at=null,acknowledged_at=null,email_payload=null,
      email_first_attempt_at=null,email_attempted_at=null,email_sent_at=null,provider_email_id=null,email_last_error=null,updated_at=now()
    where id=item.id returning * into item;
  end if;
  -- Keep the existing internal inquiry owner visible in the work queue.
  if p_kind='inquiry' then update public.haven_sessions set inquiry_owner=p_name,inquiry_revision=inquiry_revision+1,inquiry_updated_at=now() where id=item.inquiry_id; end if;
  return jsonb_build_object('id',item.id);
end; $$;

create function public.claim_team_assignment_email(p_id uuid,p_revision integer,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare item public.team_assignments;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into item from public.team_assignments where id=p_id for update;
  if item.id is null or item.revision<>p_revision or item.revoked_at is not null or item.expires_at<=now() then return null; end if;
  if item.email_sent_at is not null then return jsonb_build_object('already_sent',true); end if;
  if item.email_attempted_at>now()-interval '60 seconds' then return jsonb_build_object('busy',true); end if;
  -- Beyond the provider's 24-hour dedupe window, require a deliberate new revision.
  if item.email_first_attempt_at<now()-interval '23 hours' and item.provider_email_id is null
    then return jsonb_build_object('expired_retry',true); end if;
  update public.team_assignments set email_payload=coalesce(email_payload,p_payload),email_first_attempt_at=coalesce(email_first_attempt_at,now()),email_attempted_at=now(),email_last_error=null
    where id=p_id returning * into item;
  return jsonb_build_object('payload',item.email_payload,'provider_email_id',item.provider_email_id);
end; $$;

alter table public.team_assignments enable row level security;
alter table public.booking_confirmation_emails enable row level security;
revoke all on public.team_assignments,public.booking_confirmation_emails from public,anon,authenticated;
grant all on public.team_assignments,public.booking_confirmation_emails to service_role;
revoke all on function public.strategy_booking_confirmation(text),public.prepare_booking_confirmation(text,jsonb),public.save_team_assignment(text,text,integer,text,text,text),public.claim_team_assignment_email(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.strategy_booking_confirmation(text),public.prepare_booking_confirmation(text,jsonb),public.save_team_assignment(text,text,integer,text,text,text),public.claim_team_assignment_email(uuid,integer,jsonb) to service_role;
commit;

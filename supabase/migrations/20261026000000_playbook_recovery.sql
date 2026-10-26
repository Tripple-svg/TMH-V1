begin;
create table public.playbook_checkout_policy (
  id boolean primary key default true check(id),
  legacy_cutover_at timestamptz not null default now()
);
insert into public.playbook_checkout_policy(id) values(true);
create table public.playbook_recovery_otps (
  id uuid primary key,
  reference text not null,
  email text not null,
  code_hash text not null check(code_hash ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0 check(attempts between 0 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '10 minutes',
  consumed_at timestamptz,
  sent_at timestamptz,
  email_id text,
  delivery_error text
);
create index playbook_recovery_pair_idx on public.playbook_recovery_otps(reference,email,created_at desc);
create table public.playbook_download_grants (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  reference text not null,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 days',
  revoked_at timestamptz
);
create table public.playbook_security_limits (
  bucket text primary key,
  started_at timestamptz not null default now(),
  requests integer not null default 1
);
alter table public.playbook_checkout_policy enable row level security;
alter table public.playbook_recovery_otps enable row level security;
alter table public.playbook_download_grants enable row level security;
alter table public.playbook_security_limits enable row level security;
revoke all on public.playbook_checkout_policy,public.playbook_recovery_otps,public.playbook_download_grants,public.playbook_security_limits from public,anon,authenticated;
grant all on public.playbook_checkout_policy,public.playbook_recovery_otps,public.playbook_download_grants,public.playbook_security_limits to service_role;

create function public.consume_playbook_limit(p_bucket text,p_max integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if length(p_bucket)>160 or p_max not between 1 and 100 or p_seconds not between 1 and 86400 then raise exception 'Invalid limit'; end if;
  insert into public.playbook_security_limits(bucket) values(p_bucket)
  on conflict(bucket) do update set
    requests=case when playbook_security_limits.started_at<now()-make_interval(secs=>p_seconds) then 1 else playbook_security_limits.requests+1 end,
    started_at=case when playbook_security_limits.started_at<now()-make_interval(secs=>p_seconds) then now() else playbook_security_limits.started_at end
  returning requests into n;
  return n<=p_max;
end; $$;

create function public.reserve_playbook_recovery(p_id uuid,p_reference text,p_email text,p_code_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior public.playbook_recovery_otps;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_reference||':'||p_email,0));
  select * into prior from public.playbook_recovery_otps where reference=p_reference and email=p_email order by created_at desc limit 1 for update;
  if found and prior.created_at>now()-interval '60 seconds' then
    return jsonb_build_object('created',false,'id',prior.id);
  end if;
  update public.playbook_recovery_otps set consumed_at=now() where reference=p_reference and email=p_email and consumed_at is null;
  insert into public.playbook_recovery_otps(id,reference,email,code_hash) values(p_id,p_reference,p_email,p_code_hash);
  return jsonb_build_object('created',true,'id',p_id);
end; $$;

create function public.redeem_playbook_recovery(p_id uuid,p_code_hash text,p_grant_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare challenge public.playbook_recovery_otps;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into challenge from public.playbook_recovery_otps where id=p_id for update;
  if not found or challenge.consumed_at is not null or challenge.expires_at<=now() or challenge.attempts>=5 or challenge.sent_at is null then
    return jsonb_build_object('verified',false);
  end if;
  update public.playbook_recovery_otps set attempts=attempts+1 where id=p_id;
  if challenge.code_hash<>p_code_hash then return jsonb_build_object('verified',false); end if;
  update public.playbook_recovery_otps set consumed_at=now() where id=p_id;
  insert into public.playbook_download_grants(token_hash,reference,email) values(p_grant_hash,challenge.reference,challenge.email);
  return jsonb_build_object('verified',true,'reference',challenge.reference,'email',challenge.email);
end; $$;
revoke all on function public.consume_playbook_limit(text,integer,integer),public.reserve_playbook_recovery(uuid,text,text,text),public.redeem_playbook_recovery(uuid,text,text) from public,anon,authenticated;
grant execute on function public.consume_playbook_limit(text,integer,integer),public.reserve_playbook_recovery(uuid,text,text,text),public.redeem_playbook_recovery(uuid,text,text) to service_role;
-- Schedule privately with pg_cron, or invoke from an authenticated maintenance job.
create function public.cleanup_playbook_security()
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  delete from public.playbook_recovery_otps where created_at<now()-interval '24 hours';
  delete from public.playbook_download_grants where expires_at<now()-interval '1 day';
  delete from public.playbook_security_limits where started_at<now()-interval '2 days';
end; $$;
revoke all on function public.cleanup_playbook_security() from public,anon,authenticated;
grant execute on function public.cleanup_playbook_security() to service_role;
commit;

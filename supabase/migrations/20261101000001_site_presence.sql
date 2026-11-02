begin;

-- Optional first-party analytics, separate from Haven's functional identities.
-- No page paths, IP addresses, email, user-agent or device fingerprints.
create table public.site_presence_visitors(
  id uuid primary key,
  token_hash text not null check(token_hash~'^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index site_presence_last_seen_idx on public.site_presence_visitors(last_seen);
alter table public.site_presence_visitors enable row level security;
revoke all on public.site_presence_visitors from public,anon,authenticated;
grant all on public.site_presence_visitors to service_role;

create function public.record_site_presence(p_visitor_id uuid,p_token_hash text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved public.site_presence_visitors;snapshot_at timestamptz:=now();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  if p_visitor_id is null or p_token_hash is null or p_token_hash!~'^[a-f0-9]{64}$' then raise exception 'Invalid profile proof' using errcode='22023';end if;
  delete from public.site_presence_visitors where last_seen<snapshot_at-interval '13 months';
  insert into public.site_presence_visitors(id,token_hash,created_at,last_seen)
    values(p_visitor_id,p_token_hash,snapshot_at,snapshot_at) on conflict(id) do nothing;
  select * into saved from public.site_presence_visitors where id=p_visitor_id for update;
  if saved.token_hash is distinct from p_token_hash then raise exception 'Profile proof required' using errcode='42501';end if;
  -- Tabs/reloads can share one profile; duplicate pings cannot inflate counts.
  if saved.last_seen<=snapshot_at-interval '60 seconds' then
    update public.site_presence_visitors set last_seen=snapshot_at where id=p_visitor_id;
  end if;
  return true;
end;
$$;

create function public.site_presence_activity()
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare snapshot_at timestamptz:=now();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  delete from public.site_presence_visitors where last_seen<snapshot_at-interval '13 months';
  return jsonb_build_object(
    'savedBrowserProfiles',(select count(*) from public.site_presence_visitors),
    'activeBrowserProfiles',(select count(*) from public.site_presence_visitors where last_seen>=snapshot_at-interval '5 minutes' and last_seen<=snapshot_at),
    'windowMinutes',5,'heartbeatSeconds',120,'retentionMonths',13,'asOf',snapshot_at
  );
end;
$$;
revoke all on function public.record_site_presence(uuid,text),public.site_presence_activity() from public,anon,authenticated;
grant execute on function public.record_site_presence(uuid,text),public.site_presence_activity() to service_role;

commit;

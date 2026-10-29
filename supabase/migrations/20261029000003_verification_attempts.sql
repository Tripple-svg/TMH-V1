begin;
create table public.verification_attempts(bucket text primary key,visitor_id text references public.haven_chat_visitors(id) on delete cascade,attempts integer not null default 0,cooldown_until timestamptz,locked_at timestamptz,updated_at timestamptz not null default now());
alter table public.verification_attempts enable row level security;
revoke all on public.verification_attempts from public,anon,authenticated;
grant all on public.verification_attempts to service_role;
create function public.verification_attempt_gate(p_bucket text,p_visitor text,p_hash text,p_action text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.verification_attempts; visitor_hash text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_bucket !~ '^(network|visitor):[a-f0-9]{64}$' or p_action not in ('begin','check','success') then raise exception 'Invalid verification check'; end if;
  if p_visitor is not null then
    insert into public.haven_chat_visitors(id,token_hash) values(p_visitor,p_hash) on conflict(id) do nothing;
    select token_hash into visitor_hash from public.haven_chat_visitors where id=p_visitor;
    if visitor_hash is distinct from p_hash then raise exception 'Visitor access denied' using errcode='42501'; end if;
  end if;
  insert into public.verification_attempts(bucket,visitor_id) values(p_bucket,case when p_bucket like 'visitor:%' then p_visitor else null end) on conflict do nothing;
  select * into v from public.verification_attempts where bucket=p_bucket for update;
  -- A network is shared. It gets a temporary safeguard, never a permanent ban.
  if p_bucket like 'network:%' and v.updated_at<now()-interval '1 hour' then
    update public.verification_attempts set attempts=0,cooldown_until=null,locked_at=null where bucket=p_bucket returning * into v;
  end if;
  if p_action='success' then
    update public.verification_attempts set attempts=case when p_bucket like 'visitor:%' then 0 else greatest(0,attempts-1) end,locked_at=null,
      cooldown_until=case when p_bucket like 'visitor:%' or attempts=5 then null else cooldown_until end,updated_at=now() where bucket=p_bucket;
    return jsonb_build_object('allowed',true);
  end if;
  if v.locked_at is not null then return jsonb_build_object('allowed',false,'locked',true,'retryAfter',case when p_bucket like 'network:%' then greatest(1,extract(epoch from v.updated_at+interval '1 hour'-now())::int) else 0 end); end if;
  if v.cooldown_until>now() then return jsonb_build_object('allowed',false,'retryAfter',greatest(1,extract(epoch from v.cooldown_until-now())::int)); end if;
  if p_action='check' then return jsonb_build_object('allowed',true); end if;
  update public.verification_attempts set attempts=attempts+1,updated_at=now(),cooldown_until=case when attempts=4 then now()+interval '60 seconds' else cooldown_until end,
    locked_at=case when attempts>=6 then now() else null end where bucket=p_bucket;
  return jsonb_build_object('allowed',true);
end; $$;
revoke all on function public.verification_attempt_gate(text,text,text,text) from public,anon,authenticated;
grant execute on function public.verification_attempt_gate(text,text,text,text) to service_role;
commit;

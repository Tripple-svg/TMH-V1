begin;

create table public.review_attempts (
  network_bucket text primary key,
  failures integer not null default 0,
  cooldown_until timestamptz,
  blocked boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.review_attempts enable row level security;
revoke all on public.review_attempts from public, anon, authenticated;
grant all on public.review_attempts to service_role;

create function public.review_attempt_gate(p_network text, p_failure boolean, p_identified boolean, p_throttled boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  entry public.review_attempts;
  checked_at timestamptz;
  next_failures integer;
  next_blocked boolean;
  expires timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_network is null or p_network !~ '^[a-f0-9]{64}$' then raise exception 'Invalid network bucket'; end if;
  if p_failure or p_throttled then
    insert into public.review_attempts(network_bucket) values(p_network) on conflict do nothing;
    select * into entry from public.review_attempts where network_bucket=p_network for update;
  else
    select * into entry from public.review_attempts where network_bucket=p_network;
  end if;
  checked_at := clock_timestamp();
  if not found then return jsonb_build_object('allowed',true); end if;
  next_failures := entry.failures;
  next_blocked := entry.blocked;
  expires := entry.cooldown_until;
  if p_throttled and not next_blocked and (expires is null or expires <= checked_at) then
    next_failures := case when next_failures < 5 then 5 when next_failures < 8 then 8 else 11 end;
    next_blocked := p_identified and next_failures >= 11;
    if not p_identified and next_failures >= 11 then next_failures := 8; end if;
    expires := checked_at + interval '10 minutes';
    update public.review_attempts set failures=next_failures, blocked=next_blocked,
      cooldown_until=expires, updated_at=checked_at where network_bucket=p_network;
  end if;
  if p_failure and not next_blocked and (expires is null or expires <= checked_at) then
    next_failures := next_failures + 1;
    next_blocked := p_identified and next_failures >= 11;
    expires := case when next_failures in (5, 8) or (not p_identified and next_failures >= 11)
      then checked_at + interval '10 minutes' else null end;
    if not p_identified and next_failures >= 11 then next_failures := 8; end if;
    update public.review_attempts set failures=next_failures, blocked=next_blocked, cooldown_until=expires, updated_at=checked_at
      where network_bucket=p_network;
  end if;
  if next_blocked then return jsonb_build_object('allowed',false,'blocked',true); end if;
  if expires > checked_at then
    return jsonb_build_object('allowed',false,'retryAfter',ceil(extract(epoch from expires-checked_at)),
      'lockedUntil',extract(epoch from expires)*1000);
  end if;
  return jsonb_build_object('allowed',true);
end;
$$;
revoke all on function public.review_attempt_gate(text,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.review_attempt_gate(text,boolean,boolean,boolean) to service_role;

-- Extend the existing audited Support reset without exposing a network hash to staff.
create function public.reset_review_attempts_after_support_action()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.action='reset_review_attempts' then
    delete from public.review_attempts a using public.support_requests r
      where r.id=new.request_id and r.source='web' and a.network_bucket=r.network_bucket;
  end if;
  return new;
end;
$$;
create trigger reset_review_attempts_after_support_action after insert on public.support_actions
for each row execute function public.reset_review_attempts_after_support_action();

-- Keep every linked visitor restriction consistent when staff or Haven changes a review.
create function public.sync_review_visitor_restriction()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  update public.haven_chat_visitors set flag_status=new.flag_status,
    flag_reason=new.flag_reason, moderation_strikes=new.moderation_strikes
    where review_id=new.id and flag_status is distinct from new.flag_status;
  return new;
end;
$$;
create trigger sync_review_visitor_restriction after update of flag_status on public.brand_reviews
for each row execute function public.sync_review_visitor_restriction();
commit;

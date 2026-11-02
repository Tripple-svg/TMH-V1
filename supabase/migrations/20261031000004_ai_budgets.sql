begin;

-- Durable enforcement, separate from the best-effort usage/alert ledger. A
-- reservation remains charged after a crashed worker or unknown provider bill.
create table public.ai_budget_settings (
  id boolean primary key default true check (id),
  chat_enabled boolean not null default true,
  scoring_enabled boolean not null default true,
  visitor_daily_calls integer not null default 120 check (visitor_daily_calls between 1 and 1000000),
  visitor_daily_tokens bigint not null default 100000000 check (visitor_daily_tokens between 1 and 1000000000000),
  review_daily_calls integer not null default 120 check (review_daily_calls between 1 and 1000000),
  review_daily_tokens bigint not null default 100000000 check (review_daily_tokens between 1 and 1000000000000),
  network_daily_calls integer not null default 600 check (network_daily_calls between 1 and 1000000),
  network_daily_tokens bigint not null default 300000000 check (network_daily_tokens between 1 and 1000000000000),
  global_daily_calls integer not null default 2000 check (global_daily_calls between 1 and 1000000),
  global_daily_tokens bigint not null default 1000000000 check (global_daily_tokens between 1 and 1000000000000),
  updated_at timestamptz not null default now()
);
insert into public.ai_budget_settings(id) values(true);
create table public.ai_budget_counters (
  day date not null,
  bucket text not null,
  calls bigint not null default 0 check (calls >= 0),
  tokens bigint not null default 0 check (tokens >= 0),
  primary key(day,bucket)
);
create table public.ai_budget_reservations (
  id uuid primary key,
  kind text not null check (kind in ('chat','scoring')),
  day date not null,
  buckets text[] not null,
  reserved_calls integer not null,
  reserved_tokens bigint not null,
  charged_calls integer,
  charged_tokens bigint,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
alter table public.ai_budget_settings enable row level security;
alter table public.ai_budget_counters enable row level security;
alter table public.ai_budget_reservations enable row level security;
revoke all on public.ai_budget_settings,public.ai_budget_counters,public.ai_budget_reservations from public,anon,authenticated;
grant select,update on public.ai_budget_settings to service_role;
grant select,insert,update,delete on public.ai_budget_counters,public.ai_budget_reservations to service_role;

create function public.reserve_ai_budget(p_id uuid,p_kind text,p_visitor_hash text,p_review_hash text,p_network_hash text,p_tokens bigint,p_calls integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  settings public.ai_budget_settings%rowtype;
  budget_day date := (clock_timestamp() at time zone 'UTC')::date;
  cooldown integer;
  buckets text[] := array['global'];
  bucket_key text;
  used_calls bigint;
  used_tokens bigint;
  max_calls bigint;
  max_tokens bigint;
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege; end if;
  if p_id is null or p_kind not in ('chat','scoring') or p_kind is null
    or p_calls is null or p_calls not between 1 and 3 or p_tokens is null or p_tokens not between 1 and 100000000
    or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$'
    or (p_visitor_hash is null and p_review_hash is null)
    or (p_visitor_hash is not null and p_visitor_hash !~ '^[a-f0-9]{64}$')
    or (p_review_hash is not null and p_review_hash !~ '^[a-f0-9]{64}$') then
    raise exception 'Invalid AI budget reservation' using errcode='22023';
  end if;
  -- All reserve/settle/settings updates share this lock. No sum/read/write race
  -- can admit requests above any ceiling; rejection does not charge other keys.
  select * into strict settings from public.ai_budget_settings where id=true for update;
  budget_day := (clock_timestamp() at time zone 'UTC')::date;
  if (p_kind='chat' and not settings.chat_enabled) or (p_kind='scoring' and not settings.scoring_enabled) then
    return jsonb_build_object('allowed',false,'paused',true,'retryAfter',60);
  end if;
  if exists(select 1 from public.ai_budget_reservations where id=p_id) then
    raise exception 'AI budget reservation already exists' using errcode='23505';
  end if;
  buckets := array_append(buckets,'network:'||p_network_hash);
  if p_visitor_hash is not null then buckets := array_append(buckets,'visitor:'||p_visitor_hash); end if;
  if p_review_hash is not null then buckets := array_append(buckets,'review:'||p_review_hash); end if;
  foreach bucket_key in array buckets loop
    select calls,tokens into used_calls,used_tokens from public.ai_budget_counters where day=budget_day and bucket=bucket_key;
    if bucket_key='global' then max_calls:=settings.global_daily_calls; max_tokens:=settings.global_daily_tokens;
    elsif bucket_key like 'network:%' then max_calls:=settings.network_daily_calls; max_tokens:=settings.network_daily_tokens;
    elsif bucket_key like 'visitor:%' then max_calls:=settings.visitor_daily_calls; max_tokens:=settings.visitor_daily_tokens;
    else max_calls:=settings.review_daily_calls; max_tokens:=settings.review_daily_tokens; end if;
    if coalesce(used_calls,0)+p_calls>max_calls or coalesce(used_tokens,0)+p_tokens>max_tokens then
      cooldown:=greatest(1,ceil(extract(epoch from ((budget_day+1)::timestamp at time zone 'UTC')-clock_timestamp()))::integer);
      return jsonb_build_object('allowed',false,'paused',false,'retryAfter',cooldown);
    end if;
  end loop;
  foreach bucket_key in array buckets loop
    insert into public.ai_budget_counters(day,bucket,calls,tokens) values(budget_day,bucket_key,p_calls,p_tokens)
      on conflict(day,bucket) do update set calls=ai_budget_counters.calls+excluded.calls,tokens=ai_budget_counters.tokens+excluded.tokens;
  end loop;
  insert into public.ai_budget_reservations(id,kind,day,buckets,reserved_calls,reserved_tokens)
    values(p_id,p_kind,budget_day,buckets,p_calls,p_tokens);
  return jsonb_build_object('allowed',true,'id',p_id);
end;
$$;

create function public.settle_ai_budget(p_id uuid,p_tokens bigint,p_calls integer)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare reservation public.ai_budget_reservations%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege; end if;
  if p_tokens is null or p_tokens not between 0 and 9007199254740991 or p_calls is null or p_calls not between 0 and 3 then
    raise exception 'Invalid AI budget settlement' using errcode='22023';
  end if;
  perform 1 from public.ai_budget_settings where id=true for update;
  if not found then raise exception 'AI budget settings missing'; end if;
  select * into strict reservation from public.ai_budget_reservations where id=p_id for update;
  if reservation.settled_at is not null then return false; end if;
  if p_calls>reservation.reserved_calls then raise exception 'AI budget call overrun' using errcode='22023'; end if;
  -- Unexpected provider-reported token overruns are charged in full, preventing
  -- subsequent admissions rather than silently truncating the actual charge.
  update public.ai_budget_counters set calls=calls-reservation.reserved_calls+p_calls,tokens=tokens-reservation.reserved_tokens+p_tokens
    where day=reservation.day and bucket=any(reservation.buckets);
  update public.ai_budget_reservations set charged_calls=p_calls,charged_tokens=p_tokens,settled_at=clock_timestamp() where id=p_id;
  return true;
end;
$$;
revoke all on function public.reserve_ai_budget(uuid,text,text,text,text,bigint,integer),public.settle_ai_budget(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_budget(uuid,text,text,text,text,bigint,integer),public.settle_ai_budget(uuid,bigint,integer) to service_role;
commit;

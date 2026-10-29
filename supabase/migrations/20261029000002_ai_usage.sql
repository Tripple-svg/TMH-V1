begin;
create table public.ai_usage_events(id uuid primary key,created_at timestamptz not null default now(),provider text not null check(provider in ('gemini','groq')),model text not null,input_tokens bigint,output_tokens bigint,total_tokens bigint,diagnostic text);
create index ai_usage_day on public.ai_usage_events(created_at desc,provider);
create table public.ai_usage_alerts(id uuid primary key default gen_random_uuid(),day date not null,provider text not null,kind text not null,created_at timestamptz not null default now(),attempted_at timestamptz,sent_at timestamptz,last_error text,unique(day,provider,kind));
alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_alerts enable row level security;
revoke all on public.ai_usage_events,public.ai_usage_alerts from public,anon,authenticated;
grant all on public.ai_usage_events,public.ai_usage_alerts to service_role;
create function public.record_ai_usage(p_id uuid,p_provider text,p_model text,p_input bigint,p_output bigint,p_total bigint,p_diagnostic text,p_threshold bigint)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare kind text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_threshold<1 or length(p_model)>120 or p_input<0 or p_output<0 or p_total<0 or p_total>10000000 then raise exception 'Invalid usage'; end if;
  if p_diagnostic is not null and p_diagnostic !~ '^(gemini|groq)_[a-z0-9_]{1,70}$' then raise exception 'Invalid diagnostic'; end if;
  insert into public.ai_usage_events values(p_id,now(),p_provider,p_model,p_input,p_output,p_total,p_diagnostic) on conflict(id) do nothing;
  if p_diagnostic ~ '_http_429$' then kind:='rate_or_quota';
  elsif p_diagnostic ~ '(_http_50[0-9]|_timeout|_network_error)$' then kind:='unavailable'; end if;
  if kind is not null then insert into public.ai_usage_alerts(day,provider,kind) values((now() at time zone 'UTC')::date,p_provider,kind) on conflict do nothing; end if;
  if coalesce((select sum(total_tokens) from public.ai_usage_events where provider=p_provider and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0)>=p_threshold then
    insert into public.ai_usage_alerts(day,provider,kind) values((now() at time zone 'UTC')::date,p_provider,'budget_threshold') on conflict do nothing;
  end if;
end; $$;
create function public.ai_usage_summary() returns jsonb language sql security invoker set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from (
    select provider,model,count(*) as requests,sum(input_tokens) as input_tokens,sum(output_tokens) as output_tokens,sum(total_tokens) as total_tokens,count(*) filter(where diagnostic is not null) as failures,
      count(*) filter(where total_tokens is null and diagnostic is null) as unreported_usage
    from public.ai_usage_events where auth.role()='service_role' and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' group by provider,model
  )s;
$$;
create function public.claim_ai_alerts() returns setof public.ai_usage_alerts language sql security invoker set search_path=public,pg_temp as $$
  update public.ai_usage_alerts set attempted_at=now() where id in (
    select id from public.ai_usage_alerts where auth.role()='service_role' and sent_at is null and (attempted_at is null or attempted_at<now()-interval '2 minutes')
    and created_at>now()-interval '23 hours' order by created_at for update skip locked limit 10
  ) returning *;
$$;
revoke all on function public.record_ai_usage(uuid,text,text,bigint,bigint,bigint,text,bigint),public.ai_usage_summary(),public.claim_ai_alerts() from public,anon,authenticated;
grant execute on function public.record_ai_usage(uuid,text,text,bigint,bigint,bigint,text,bigint),public.ai_usage_summary(),public.claim_ai_alerts() to service_role;
commit;

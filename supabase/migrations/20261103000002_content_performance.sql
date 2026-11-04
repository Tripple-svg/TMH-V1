begin;
create table public.content_performance_daily(day date not null default current_date,content_id text not null,event text not null check(event in ('view','action')),total bigint not null default 0,primary key(day,content_id,event));
create table public.content_performance_receipts(visitor_id uuid not null references public.site_presence_visitors(id) on delete cascade,day date not null default current_date,content_id text not null,event text not null,primary key(visitor_id,day,content_id,event));
alter table public.content_performance_daily enable row level security;
alter table public.content_performance_receipts enable row level security;
revoke all on public.content_performance_daily,public.content_performance_receipts from public,anon,authenticated;
grant all on public.content_performance_daily,public.content_performance_receipts to service_role;
create function public.record_content_performance(p_visitor uuid,p_hash text,p_content text,p_event text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  if p_content not in ('hero','about','services','free-class','shop','testimonials') or p_event not in ('view','action') then raise exception 'Invalid content event';end if;
  perform 1 from public.site_presence_visitors where id=p_visitor and token_hash=p_hash and last_seen>now()-interval '5 minutes' for share;
  if not found then raise exception 'Current profile proof required' using errcode='42501';end if;
  insert into public.content_performance_receipts(visitor_id,content_id,event) values(p_visitor,p_content,p_event) on conflict do nothing;
  if found then insert into public.content_performance_daily(content_id,event,total) values(p_content,p_event,1) on conflict(day,content_id,event) do update set total=content_performance_daily.total+1;end if;
  return true;
end; $$;
create function public.admin_content_performance(p_actor uuid,p_days integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.production_admin_actor(p_actor);if p_days not in (7,30) then raise exception 'Invalid period';end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from (select content_id,sum(total) filter(where event='view') as views,sum(total) filter(where event='action') as actions from public.content_performance_daily where day>=current_date-(p_days-1) group by content_id order by content_id) r),'[]');
end; $$;
revoke all on function public.record_content_performance(uuid,text,text,text),public.admin_content_performance(uuid,integer) from public,anon,authenticated;
grant execute on function public.record_content_performance(uuid,text,text,text),public.admin_content_performance(uuid,integer) to service_role;
-- Receipt identifiers are short-lived; the aggregate contains no browser identity.
create function public.expire_content_performance() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  delete from public.content_performance_receipts where day<current_date-2;
  delete from public.content_performance_daily where day<current_date-395;
end; $$;
revoke all on function public.expire_content_performance() from public,anon,authenticated;
grant execute on function public.expire_content_performance() to service_role;
commit;

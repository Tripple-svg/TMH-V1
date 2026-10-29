begin;
alter table public.strategy_call_bookings drop constraint strategy_call_bookings_source_check;
alter table public.strategy_call_bookings add constraint strategy_call_bookings_source_check check(source in ('legacy','lead','service','team','calendly'));
alter table public.booking_intents
  add column visitor_id text references public.haven_chat_visitors(id) on delete set null,
  add column review_id text references public.brand_reviews(id) on delete set null,
  add column source text not null default 'service' check(source in ('lead','service','team')),
  add column reservation_expires_at timestamptz,
  add column confirmed_at timestamptz;
create index booking_intents_visitor on public.booking_intents(visitor_id,created_at desc);
create function public.reserve_strategy_booking(p_visitor text,p_hash text,p_email text,p_review text,p_service text,p_source text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.haven_chat_visitors; b public.strategy_call_bookings; i public.booking_intents; linked text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  -- One short reservation transaction serializes cross-entry and cross-email races.
  perform pg_advisory_xact_lock(hashtextextended('tmh-booking-reservation',0));
  insert into public.haven_chat_visitors(id,token_hash) values(p_visitor,p_hash) on conflict(id) do nothing;
  select * into v from public.haven_chat_visitors where id=p_visitor for update;
  if v.token_hash is distinct from p_hash then raise exception 'Visitor access denied' using errcode='42501'; end if;
  linked:=coalesce(p_review,v.review_id);
  if v.flag_status='red' or exists(select 1 from public.brand_reviews where id=linked and flag_status='red') then
    return jsonb_build_object('restricted',true);
  end if;
  select s.* into b from public.strategy_call_bookings s left join public.booking_intents bi on bi.id=s.booking_intent_id
    where s.status in ('active','confirmed') and coalesce(s.end_time,s.start_time)>now()
      and (lower(s.email)=lower(p_email) or bi.visitor_id=p_visitor or linked is not null and s.review_id=linked)
    order by s.start_time limit 1;
  if found then return jsonb_build_object('alreadyBooked',true,'startTime',b.start_time); end if;
  select * into i from public.booking_intents where confirmed_at is null and reservation_expires_at>now()
    and (visitor_id=p_visitor or lower(email)=lower(p_email) or linked is not null and review_id=linked)
    order by created_at desc limit 1;
  if found then return jsonb_build_object('pending',true,'retryAfter',greatest(1,extract(epoch from i.reservation_expires_at-now())::int)); end if;
  insert into public.booking_intents(email,visitor_id,review_id,service_id,source,reservation_expires_at)
    values(lower(p_email),p_visitor,linked,p_service,p_source,now()+interval '30 minutes') returning * into i;
  return jsonb_build_object('intentId',i.id);
end; $$;
create function public.visitor_strategy_booking(p_visitor text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.strategy_call_bookings; linked text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select review_id into linked from public.haven_chat_visitors where id=p_visitor;
  select s.* into b from public.strategy_call_bookings s left join public.booking_intents bi on bi.id=s.booking_intent_id
    where s.status in ('active','confirmed') and coalesce(s.end_time,s.start_time)>now()
      and (bi.visitor_id=p_visitor or linked is not null and s.review_id=linked) order by s.start_time limit 1;
  if found then return jsonb_build_object('confirmed',true,'startTime',b.start_time); end if;
  return jsonb_build_object('pending',exists(select 1 from public.booking_intents where visitor_id=p_visitor and confirmed_at is null and reservation_expires_at>now()));
end; $$;
revoke all on function public.reserve_strategy_booking(text,text,text,text,text,text),public.visitor_strategy_booking(text) from public,anon,authenticated;
grant execute on function public.reserve_strategy_booking(text,text,text,text,text,text),public.visitor_strategy_booking(text) to service_role;
commit;

-- Launch hardening. Existing versioned deliveries retain their original bytes.
begin;
alter table public.playbook_purchases alter column email_template_version set default 'editorial-v4';
alter table public.brand_reviews alter column welcome_template_version set default 'editorial-v4';
alter table public.flag_alert_notifications alter column email_template_version set default 'editorial-v4';
alter table public.booking_intents alter column booking_email_version set default 'editorial-v4';
alter table public.brand_reviews alter column booking_email_version set default 'editorial-v4';
alter table public.strategy_call_bookings alter column booking_email_version set default 'editorial-v4';
alter table public.playbook_purchase_followups drop constraint if exists playbook_purchase_followups_template_version_check;
alter table public.playbook_purchase_followups add constraint playbook_purchase_followups_template_version_check check(template_version in ('editorial-v3','editorial-v4'));
alter table public.playbook_purchase_followups alter column template_version set default 'editorial-v4';
alter table public.data_export_requests add column if not exists archive_version integer not null default 1 check(archive_version in (1,2));
alter table public.data_export_requests alter column archive_version set default 2;
create or replace function public.prepare_data_export(p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.data_export_requests; data jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
  select * into r from public.data_export_requests where token_hash=p_hash for update;
  if not found or r.expires_at<=now() or r.accepted_at is not null or r.first_attempt_at<=now()-interval '23 hours' then return jsonb_build_object('unavailable',true);end if;
  if r.snapshot is null then
    select jsonb_build_object('exportedAt',r.created_at,'scope','Matching saved reviews and linked chats. Ask Support about other records.',
      'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.full_name,'brand',b.brand_name,'email',b.email,'phone',b.whatsapp,
        'website',b.website_url,'social',b.social_link,'score',b.haven_score,'scoreBreakdown',b.score_breakdown,'assessment',b.assessment_summary,'createdAt',b.created_at))
        from public.brand_reviews b where lower(b.email)=lower(r.email)),'[]'),
      'conversations',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'scope',s.scope,'createdAt',s.created_at,'messages',
        (select coalesce(jsonb_agg(jsonb_build_object('role',m->>'role','content',m->>'content','timestamp',m->'timestamp')),'[]') from jsonb_array_elements(coalesce(s.messages,'[]')) m)))
        from public.haven_sessions s join public.brand_reviews b on b.id=s.review_id where lower(b.email)=lower(r.email)),'[]')) into data;
    -- Bounded email attachment. Larger requests use a human-verified process.
    if octet_length(data::text)>4000000 then return jsonb_build_object('tooLarge',true);end if;
    update public.data_export_requests set snapshot=data,first_attempt_at=now() where id=r.id returning * into r;
  end if;
  return jsonb_build_object('id',r.id,'email',r.email,'snapshot',r.snapshot,'archiveVersion',r.archive_version);
end; $$;

-- Calendly remains the source of truth for the lead's current booking badge.
create or replace function public.refresh_review_booking_status() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare target text; targets text[];
begin
  if TG_OP='INSERT' then targets:=array[NEW.review_id];
  elsif TG_OP='DELETE' then targets:=array[OLD.review_id];
  else targets:=array[OLD.review_id,NEW.review_id];end if;
  for target in select distinct unnest(targets) loop
    if target is not null then
      update public.brand_reviews r set call_booked_at=(select min(b.start_time) from public.strategy_call_bookings b where b.review_id=target and b.status in ('active','confirmed') and coalesce(b.end_time,b.start_time+interval '30 minutes')>now()) where r.id=target;
    end if;
  end loop;
  return null;
end; $$;
revoke all on function public.refresh_review_booking_status() from public,anon,authenticated;
drop trigger if exists refresh_review_booking_status on public.strategy_call_bookings;
create trigger refresh_review_booking_status after insert or update or delete on public.strategy_call_bookings for each row execute function public.refresh_review_booking_status();
-- Current booking context exposes only verified scheduling times, never private URLs.
create or replace function public.reserve_strategy_booking(p_visitor text,p_hash text,p_email text,p_review text,p_service text,p_source text)
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
    where s.status in ('active','confirmed') and coalesce(s.end_time,s.start_time+interval '30 minutes')>now()
      and (lower(s.email)=lower(p_email) or bi.visitor_id=p_visitor or linked is not null and s.review_id=linked)
    order by s.start_time limit 1;
  if found then return jsonb_build_object('alreadyBooked',true,'startTime',b.start_time,'endTime',coalesce(b.end_time,b.start_time+interval '30 minutes')); end if;
  select * into i from public.booking_intents where confirmed_at is null and reservation_expires_at>now()
    and (visitor_id=p_visitor or lower(email)=lower(p_email) or linked is not null and review_id=linked)
    order by created_at desc limit 1;
  if found then return jsonb_build_object('pending',true,'retryAfter',greatest(1,extract(epoch from i.reservation_expires_at-now())::int)); end if;
  insert into public.booking_intents(email,visitor_id,review_id,service_id,source,reservation_expires_at)
    values(lower(p_email),p_visitor,linked,p_service,p_source,now()+interval '30 minutes') returning * into i;
  return jsonb_build_object('intentId',i.id);
end; $$;
create or replace function public.visitor_strategy_booking(p_visitor text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.strategy_call_bookings; linked text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select review_id into linked from public.haven_chat_visitors where id=p_visitor;
  select s.* into b from public.strategy_call_bookings s left join public.booking_intents bi on bi.id=s.booking_intent_id
    where s.status in ('active','confirmed') and coalesce(s.end_time,s.start_time+interval '30 minutes')>now()
      and (bi.visitor_id=p_visitor or linked is not null and s.review_id=linked) order by s.start_time limit 1;
  if found then return jsonb_build_object('confirmed',true,'startTime',b.start_time,'endTime',coalesce(b.end_time,b.start_time+interval '30 minutes')); end if;
  return jsonb_build_object('pending',exists(select 1 from public.booking_intents where visitor_id=p_visitor and confirmed_at is null and reservation_expires_at>now()));
end; $$;

commit;

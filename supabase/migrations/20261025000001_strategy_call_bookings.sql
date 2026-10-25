begin;
-- Extend the existing onsite booking table; retain every historical booking,
-- its bigint identity, published-slot constraint and confirmation fields.
alter table public.strategy_call_bookings
  add column if not exists invitee_uri text,
  add column if not exists event_uri text,
  add column if not exists event_name text,
  add column if not exists start_time timestamptz,
  add column if not exists end_time timestamptz,
  add column if not exists timezone text,
  add column if not exists source text not null default 'legacy',
  add column if not exists booking_intent_id uuid references public.booking_intents(id) on delete set null,
  add column if not exists service_id text,
  add column if not exists provider_created_at timestamptz,
  add column if not exists last_synced_at timestamptz not null default now();
alter table public.strategy_call_bookings
  alter column full_name drop not null,
  alter column whatsapp drop not null,
  alter column booked_date drop not null,
  alter column booked_time drop not null;
alter table public.strategy_call_bookings drop constraint if exists strategy_call_bookings_status_check;
alter table public.strategy_call_bookings add constraint strategy_call_bookings_status_check
  check(status in ('confirmed','cancelled','completed','no_show','active','canceled'));
alter table public.strategy_call_bookings add constraint strategy_call_bookings_source_check
  check(source in ('legacy','lead','service','calendly'));
alter table public.strategy_call_bookings add constraint strategy_call_bookings_provider_time_check
  check(invitee_uri is null or status='canceled' or start_time is not null);
update public.strategy_call_bookings set start_time=(booked_date + to_timestamp(booked_time,'HH12:MI AM')::time) at time zone 'Africa/Lagos', timezone='Africa/Lagos'
  where start_time is null and booked_date is not null and booked_time is not null;
create unique index strategy_call_bookings_invitee_idx on public.strategy_call_bookings(invitee_uri);
create index strategy_call_bookings_start_idx on public.strategy_call_bookings(start_time desc);
alter table public.strategy_call_bookings enable row level security;
drop policy if exists anon_insert_bookings on public.strategy_call_bookings;
revoke all on public.strategy_call_bookings from public,anon,authenticated;
revoke all on sequence public.strategy_call_bookings_id_seq from public,anon,authenticated;
grant all on public.strategy_call_bookings to service_role;
grant usage,select on sequence public.strategy_call_bookings_id_seq to service_role;

-- Cancellation wins over an out-of-order invitee.created webhook or active poll.
-- A rescheduled invitee has a new URI, so its new slot is a separate record.
create function public.record_strategy_call_booking(p_booking jsonb)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  insert into public.strategy_call_bookings(invitee_uri,event_uri,email,full_name,event_name,start_time,end_time,timezone,status,source,review_id,booking_intent_id,service_id,provider_created_at)
  values(p_booking->>'invitee_uri',p_booking->>'event_uri',p_booking->>'email',p_booking->>'full_name',p_booking->>'event_name',
    (p_booking->>'start_time')::timestamptz,(p_booking->>'end_time')::timestamptz,p_booking->>'timezone',p_booking->>'status',p_booking->>'source',
    p_booking->>'review_id',(p_booking->>'booking_intent_id')::uuid,p_booking->>'service_id',(p_booking->>'provider_created_at')::timestamptz)
  on conflict(invitee_uri) do update set
    full_name=coalesce(excluded.full_name,strategy_call_bookings.full_name),
    event_name=coalesce(excluded.event_name,strategy_call_bookings.event_name),
    start_time=coalesce(excluded.start_time,strategy_call_bookings.start_time),
    end_time=coalesce(excluded.end_time,strategy_call_bookings.end_time),
    timezone=coalesce(excluded.timezone,strategy_call_bookings.timezone),
    status=case when strategy_call_bookings.status='canceled' then 'canceled' else excluded.status end,
    source=case when excluded.source='calendly' then strategy_call_bookings.source else excluded.source end,
    review_id=coalesce(excluded.review_id,strategy_call_bookings.review_id),
    booking_intent_id=coalesce(excluded.booking_intent_id,strategy_call_bookings.booking_intent_id),
    service_id=coalesce(excluded.service_id,strategy_call_bookings.service_id),last_synced_at=now();
end;
$$;
revoke all on function public.record_strategy_call_booking(jsonb) from public,anon,authenticated;
grant execute on function public.record_strategy_call_booking(jsonb) to service_role;
commit;

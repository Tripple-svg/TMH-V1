begin;
create table public.support_requests (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'new' check(status in ('new','in_progress','waiting_customer','resolved')),
  category text not null check(category in ('review_access','rate_limit','purchase','booking','other')),
  source text not null default 'web' check(source in ('web','zoho')),
  name text not null default '' check(length(name)<=100),
  email text not null check(length(email)<=254),
  message text not null check(length(message) between 10 and 4000),
  visitor_id text references public.haven_chat_visitors(id) on delete set null,
  network_bucket text check(network_bucket ~ '^[a-f0-9]{64}$'),
  revision integer not null default 0,
  notes text not null default '' check(length(notes)<=4000),
  notification_attempted_at timestamptz,
  notification_first_attempt_at timestamptz,
  notification_accepted_at timestamptz,
  notification_email_id text,
  notification_error text,
  external_id text unique
);
create index support_work_queue on public.support_requests(status,created_at desc);
create index support_delivery_queue on public.support_requests(created_at) where notification_accepted_at is null;
create table public.support_actions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  actor_id uuid not null,
  action text not null,
  reason text not null check(length(reason) between 10 and 500)
);
alter table public.support_requests enable row level security;
alter table public.support_actions enable row level security;
revoke all on public.support_requests,public.support_actions from public,anon,authenticated;
grant all on public.support_requests,public.support_actions to service_role;

-- A request's contact email is NOT identity proof. Only a verified browser key
-- attaches visitor_id; admin recovery never returns a review key or download.
create function public.claim_support_notifications() returns setof public.support_requests
language sql security invoker set search_path=public,pg_temp as $$
  update public.support_requests set notification_attempted_at=now(),
    notification_first_attempt_at=coalesce(notification_first_attempt_at,now())
  where auth.role()='service_role' and id in (
    select id from public.support_requests where notification_accepted_at is null
      and (notification_attempted_at is null or notification_attempted_at<now()-interval '2 minutes')
      and (notification_email_id is not null or notification_first_attempt_at is null or notification_first_attempt_at>now()-interval '23 hours')
    order by created_at limit 20 for update skip locked
  ) returning *;
$$;
create function public.update_support_request(p_id uuid,p_revision integer,p_status text,p_notes text,p_actor uuid,p_action text,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.support_requests; changed integer:=0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_actor is null or p_revision is null or p_status not in ('new','in_progress','waiting_customer','resolved')
    or p_notes is null or length(p_notes)>4000 or p_action not in ('update','reset_review_attempts','reset_verification')
    or p_reason is null or length(trim(p_reason)) not between 10 and 500 then raise exception 'Invalid support update'; end if;
  select * into r from public.support_requests where id=p_id for update;
  if not found then return jsonb_build_object('missing',true); end if;
  if r.revision<>p_revision then return jsonb_build_object('conflict',true); end if;
  if p_action<>'update' then
    if exists(select 1 from public.support_actions where request_id=p_id and action=p_action and created_at>now()-interval '1 hour') then
      return jsonb_build_object('cooldown',true);
    end if;
    if p_action='reset_review_attempts' then
      if r.source<>'web' or r.network_bucket is null then return jsonb_build_object('unavailable',true); end if;
      delete from public.playbook_security_limits where bucket in ('public:email-lookup:'||r.network_bucket,'public:review-submit:'||r.network_bucket);
      get diagnostics changed=row_count;
    elsif p_action='reset_verification' then
      if r.visitor_id is null then return jsonb_build_object('unavailable',true); end if;
      -- Device proof was checked when the support request was created. Network
      -- limits remain separate: never clear a whole shared network's OTP lock.
      update public.verification_attempts set attempts=0,cooldown_until=null,locked_at=null,updated_at=now() where visitor_id=r.visitor_id;
      get diagnostics changed=row_count;
    end if;
  end if;
  update public.support_requests set status=p_status,notes=p_notes,revision=revision+1,updated_at=now() where id=p_id;
  insert into public.support_actions(request_id,actor_id,action,reason) values(p_id,p_actor,p_action,trim(p_reason));
  return jsonb_build_object('ok',true,'changed',changed);
end; $$;
create function public.purge_resolved_support() returns void language sql security invoker set search_path=public,pg_temp as $$
  delete from public.support_requests where auth.role()='service_role' and status='resolved' and updated_at<now()-interval '90 days';
$$;
revoke all on function public.claim_support_notifications(),public.update_support_request(uuid,integer,text,text,uuid,text,text),public.purge_resolved_support() from public,anon,authenticated;
grant execute on function public.claim_support_notifications(),public.update_support_request(uuid,integer,text,text,uuid,text,text),public.purge_resolved_support() to service_role;
commit;

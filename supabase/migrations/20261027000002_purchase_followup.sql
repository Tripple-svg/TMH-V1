begin;
-- Version defaults affect NEW records only. Pending mail keeps its exact payload.
alter table public.playbook_purchases alter column email_template_version set default 'editorial-v3';
alter table public.brand_reviews alter column welcome_template_version set default 'editorial-v3';
alter table public.flag_alert_notifications alter column email_template_version set default 'editorial-v3';

alter table public.playbook_purchases
  add column buyer_first_name text,
  add column paid_at timestamptz,
  add column followup_opt_in boolean not null default false,
  add column followup_consent_version text;

create table public.playbook_purchase_followups (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.playbook_purchases(id) on delete cascade,
  reference text not null unique,
  email text not null,
  first_name text,
  consent_version text not null check(consent_version='2026-10-27'),
  template_version text not null default 'editorial-v3' check(template_version='editorial-v3'),
  created_at timestamptz not null default now(),
  due_at timestamptz not null,
  next_attempt_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  attempted_at timestamptz,
  attempts integer not null default 0 check(attempts between 0 and 6),
  claim_id uuid,
  claimed_until timestamptz,
  email_payload jsonb,
  provider_email_id text,
  sent_at timestamptz,
  cancelled_at timestamptz,
  last_error text
);
create index playbook_followups_due_idx on public.playbook_purchase_followups(due_at,next_attempt_at)
  where sent_at is null and cancelled_at is null;
alter table public.playbook_purchase_followups enable row level security;
revoke all on public.playbook_purchase_followups from public,anon,authenticated;
grant all on public.playbook_purchase_followups to service_role;

create function public.enrol_playbook_purchase_followup()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  -- No backfill: old purchases and recovery requests do not opt a buyer in.
  if new.followup_opt_in and new.followup_consent_version='2026-10-27' and new.paid_at is not null then
    insert into public.playbook_purchase_followups(purchase_id,reference,email,first_name,consent_version,due_at)
      values(new.id,new.reference,new.email,new.buyer_first_name,new.followup_consent_version,new.paid_at+interval '24 hours');
  end if;
  return new;
end; $$;
revoke all on function public.enrol_playbook_purchase_followup() from public,anon,authenticated;
create trigger enrol_playbook_purchase_followup after insert on public.playbook_purchases
  for each row execute function public.enrol_playbook_purchase_followup();

create function public.claim_playbook_followups(p_limit integer default 5)
returns setof public.playbook_purchase_followups
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_limit not between 1 and 10 then raise exception 'Invalid batch limit'; end if;
  return query
    with due as (
      select id from public.playbook_purchase_followups
      where sent_at is null and cancelled_at is null and due_at<=now()
        and due_at>now()-interval '7 days' and next_attempt_at<=now()
        and (claimed_until is null or claimed_until<=now()) and attempts<6
        -- Keep retries inside the mail provider's 24-hour idempotency retention.
        and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours')
      order by due_at limit p_limit for update skip locked
    )
    update public.playbook_purchase_followups f set
      claim_id=gen_random_uuid(),claimed_until=now()+interval '2 minutes',
      first_attempt_at=coalesce(f.first_attempt_at,now()),attempted_at=now(),attempts=f.attempts+1,
      next_attempt_at=now()+case f.attempts when 0 then interval '2 minutes' when 1 then interval '10 minutes'
        when 2 then interval '30 minutes' when 3 then interval '2 hours' when 4 then interval '6 hours' else interval '12 hours' end
    from due where f.id=due.id returning f.*;
end; $$;

create function public.save_playbook_followup_payload(p_id uuid,p_claim_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare job public.playbook_purchase_followups;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into job from public.playbook_purchase_followups where id=p_id and claim_id=p_claim_id for update;
  if not found or job.cancelled_at is not null or job.sent_at is not null then return null; end if;
  if job.email_payload is not null then return job.email_payload; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>150000
    or p_payload->>'subject' is distinct from 'Did you get a chance to read The Playbook?'
    or jsonb_typeof(p_payload->'to') is distinct from 'array' or jsonb_array_length(p_payload->'to')<>1
    or p_payload->'to'->>0 is distinct from job.email
    or nullif(p_payload->>'text','') is null or nullif(p_payload->>'html','') is null
    or nullif(p_payload->>'from','') is null then raise exception 'Invalid saved email payload'; end if;
  update public.playbook_purchase_followups set email_payload=p_payload where id=p_id;
  return p_payload;
end; $$;

create function public.complete_playbook_followup(p_id uuid,p_claim_id uuid,p_email_id text default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_email_id is not null and p_email_id !~ '^[A-Za-z0-9_-]{1,200}$' then raise exception 'Invalid provider id'; end if;
  if p_error is not null and p_error !~ '^[a-z0-9_]{1,100}$' then raise exception 'Invalid error code'; end if;
  update public.playbook_purchase_followups set
    provider_email_id=coalesce(p_email_id,provider_email_id),
    sent_at=case when p_email_id is not null then coalesce(sent_at,now()) else sent_at end,
    claimed_until=null,claim_id=null,last_error=p_error
  where id=p_id and claim_id=p_claim_id;
  return found;
end; $$;

create function public.cancel_playbook_followup(p_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.playbook_purchase_followups set cancelled_at=coalesce(cancelled_at,now()) where id=p_id;
end; $$;

create function public.playbook_followup_stats()
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  return (select jsonb_build_object(
    'queued',count(*) filter(where sent_at is null and cancelled_at is null and due_at>now()),
    'due',count(*) filter(where sent_at is null and cancelled_at is null and due_at<=now() and attempts<6 and due_at>now()-interval '7 days' and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours')),
    'accepted',count(*) filter(where sent_at is not null),
    'cancelled',count(*) filter(where cancelled_at is not null),
    'needsReview',count(*) filter(where sent_at is null and cancelled_at is null and (attempts>=6 or due_at<=now()-interval '7 days' or first_attempt_at<=now()-interval '23 hours'))
  ) from public.playbook_purchase_followups);
end; $$;

revoke all on function public.claim_playbook_followups(integer),public.save_playbook_followup_payload(uuid,uuid,jsonb),public.complete_playbook_followup(uuid,uuid,text,text),public.cancel_playbook_followup(uuid),public.playbook_followup_stats() from public,anon,authenticated;
grant execute on function public.claim_playbook_followups(integer),public.save_playbook_followup_payload(uuid,uuid,jsonb),public.complete_playbook_followup(uuid,uuid,text,text),public.cancel_playbook_followup(uuid),public.playbook_followup_stats() to service_role;

-- Scheduling is configured separately via pg_cron + pg_net and Vault. Do not put
-- a live service key in this migration. The worker is internal-service-only.
comment on column public.playbook_purchase_followups.sent_at is 'Provider acceptance, not proof of inbox delivery.';
comment on column public.playbook_purchase_followups.email_payload is 'Frozen before sending; contains a narrow signed opt-out URL. Never expose in admin API or client.';
commit;

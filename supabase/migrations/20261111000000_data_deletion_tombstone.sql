begin;

create table public.deleted_visitor_emails (
  email_hash text primary key check (email_hash ~ '^[a-f0-9]{64}$'),
  deleted_at timestamptz not null default now()
);
create table public.deleted_review_networks (
  network_hash text primary key check (network_hash ~ '^[a-f0-9]{64}$'),
  blocked_until timestamptz not null
);
alter table public.deleted_visitor_emails enable row level security;
alter table public.deleted_review_networks enable row level security;
revoke all on public.deleted_visitor_emails, public.deleted_review_networks from public, anon, authenticated;
grant select, insert, update, delete on public.deleted_visitor_emails, public.deleted_review_networks to service_role;

alter table public.data_deletion_requests
  add column network_hash text check (network_hash ~ '^[a-f0-9]{64}$'),
  add column cleanup_review_ids text[] not null default '{}',
  add column cleanup_visitor_ids text[] not null default '{}';
create index data_deletion_removed_email_idx on public.data_deletion_requests (lower(email))
  where deleted_count > 0 and records_removed_at is not null;
create index support_requests_deletion_email_idx on public.support_requests (lower(email));
create index support_requests_deletion_visitor_idx on public.support_requests (visitor_id);

create function public.review_deletion_status(p_email text, p_email_hash text, p_network_hash text)
returns text language sql stable security invoker set search_path = public, pg_temp as $$
  select case
    when auth.role() is distinct from 'service_role' then null
    when exists (select 1 from public.deleted_visitor_emails where email_hash = p_email_hash)
      or exists (select 1 from public.data_deletion_requests where lower(email) = lower(trim(p_email))
        and deleted_count > 0 and records_removed_at is not null) then 'email'
    when exists (select 1 from public.deleted_review_networks where network_hash = p_network_hash
      and blocked_until > now()) then 'network'
    else null end;
$$;

-- Recheck under the same locks as deletion, so a simultaneous submission cannot
-- recreate a review between the Edge Function's precheck and the insert.
create function public.create_haven_review_after_deletion_check(
  p_review jsonb, p_session_id text, p_token_hash text, p_email_hash text, p_network_hash text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare denial text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_email_hash is null or p_email_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid email hash' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_review->>'email')), 0));
  if p_network_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_network_hash, 1));
  end if;
  denial := public.review_deletion_status(p_review->>'email', p_email_hash, p_network_hash);
  if denial is not null then return jsonb_build_object('deletionBlock', denial); end if;
  return public.create_haven_review(p_review, p_session_id, p_token_hash);
end;
$$;

drop function public.prepare_saved_review_deletion(text);
create function public.prepare_saved_review_deletion(p_token text, p_email_hash text, p_network_hash text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r public.data_deletion_requests;
  lead record;
  ids text[] := '{}';
  visitors text[] := '{}';
  paths text[] := '{}';
  network text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_email_hash is null or p_email_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid email hash' using errcode = '22023';
  end if;
  select * into r from public.data_deletion_requests where token = p_token;
  if not found then return jsonb_build_object('error', 'Invalid token'); end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(trim(r.email)), 0));
  select * into r from public.data_deletion_requests where token = p_token for update;
  if not found then return jsonb_build_object('error', 'Invalid token'); end if;
  if r.status = 'confirmed' then return jsonb_build_object('error', 'Already used'); end if;
  if r.records_removed_at is null and (r.status = 'expired' or r.expires_at <= now()) then
    update public.data_deletion_requests set status = 'expired' where id = r.id;
    return jsonb_build_object('error', 'Link expired');
  end if;

  if r.records_removed_at is null then
    if public.review_deletion_status(r.email, p_email_hash, null) = 'email' then
      return jsonb_build_object('error', 'Already used');
    end if;
    network := coalesce(r.network_hash, p_network_hash);
    if network is not null then
      perform pg_advisory_xact_lock(hashtextextended(network, 1));
    end if;

    for lead in select id, screenshot_url from public.brand_reviews where lower(email) = lower(trim(r.email)) for update loop
      ids := array_append(ids, lead.id);
      if nullif(lead.screenshot_url, '') is not null then
        if left(lead.screenshot_url, length(lead.id) + 1) <> lead.id || '/'
          or '..' = any(string_to_array(lead.screenshot_url, '/')) then
          raise exception 'Invalid stored screenshot path' using errcode = '22023';
        end if;
        paths := array_append(paths, lead.screenshot_url);
      end if;
    end loop;
    -- The email link was issued for a saved review. A stale link for an absent
    -- review cannot delete unrelated support records or block a network.
    if cardinality(ids) = 0 then return jsonb_build_object('error', 'Already used'); end if;
    select coalesce(array_agg(id), '{}') into visitors from (
      select id from public.haven_chat_visitors where review_id = any(ids) for update
    ) linked;

    insert into public.deleted_visitor_emails (email_hash) values (p_email_hash) on conflict do nothing;
    if network is not null then
      insert into public.deleted_review_networks (network_hash, blocked_until) values (network, now() + interval '24 hours')
        on conflict (network_hash) do update set blocked_until = excluded.blocked_until;
    end if;
    delete from public.support_requests where lower(email) = lower(trim(r.email)) or visitor_id = any(visitors);
    delete from public.haven_sessions where review_id = any(ids) or visitor_id = any(visitors);
    delete from public.haven_chat_visitors where id = any(visitors);
    delete from public.brand_reviews where id = any(ids);
    update public.data_deletion_requests set cleanup_paths = paths, cleanup_review_ids = ids,
      cleanup_visitor_ids = visitors, deleted_count = cardinality(ids), records_removed_at = now(),
      network_hash = null, ip_address = null where id = r.id returning * into r;
  end if;
  return jsonb_build_object('requestId', r.id, 'email', r.email, 'paths', to_jsonb(r.cleanup_paths),
    'deleted', r.deleted_count, 'reviewIds', to_jsonb(r.cleanup_review_ids), 'visitorIds', to_jsonb(r.cleanup_visitor_ids));
end;
$$;

create or replace function public.complete_saved_review_deletion(p_request uuid)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  update public.data_deletion_requests set status = 'confirmed', confirmed_at = now(), cleanup_paths = '{}',
    cleanup_review_ids = '{}', cleanup_visitor_ids = '{}'
    where id = p_request and status = 'pending' and records_removed_at is not null;
  return found;
end;
$$;

revoke all on function public.prepare_saved_review_deletion(text, text, text),
  public.review_deletion_status(text, text, text),
  public.create_haven_review_after_deletion_check(jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.prepare_saved_review_deletion(text, text, text),
  public.review_deletion_status(text, text, text),
  public.create_haven_review_after_deletion_check(jsonb, text, text, text, text) to service_role;

create or replace function public.production_private_retention() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  delete from public.admin_login_events where occurred_at < now() - interval '30 days';
  delete from public.admin_login_devices where last_seen < now() - interval '30 days';
  delete from public.admin_backup_codes where consumed_at < now() - interval '30 days';
  delete from public.admin_live_notifications where created_at < now() - interval '7 days';
  delete from public.data_export_requests where expires_at < now() or accepted_at < now() - interval '1 day';
  delete from public.deleted_review_networks where blocked_until <= now();
  update public.data_deletion_requests set network_hash = null where network_hash is not null and expires_at <= now();
end;
$$;
commit;

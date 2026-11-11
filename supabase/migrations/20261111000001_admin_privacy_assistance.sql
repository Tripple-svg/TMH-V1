begin;

create function public.prepare_admin_privacy_assistance(
  p_actor uuid, p_id uuid, p_action text, p_token text, p_network text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.data_deletion_requests;
  audit_action text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform 1 from auth.users where id = p_actor and raw_app_meta_data->>'role' = 'admin'
    and deleted_at is null and (banned_until is null or banned_until <= now()) for share;
  if not found then raise exception 'Current admin required' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('send_link', 'retry_cleanup') or p_network is null or p_network !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid privacy action' using errcode = '22023';
  end if;

  select * into item from public.data_deletion_requests where id = p_id;
  if not found then return jsonb_build_object('state', 'missing'); end if;
  -- Serialize with customer confirmation and other requests for the same address.
  perform pg_advisory_xact_lock(hashtextextended(lower(trim(item.email)), 0));
  select * into item from public.data_deletion_requests where id = p_id for update;
  if not found then return jsonb_build_object('state', 'missing'); end if;

  if p_action = 'send_link' then
    if item.status = 'confirmed' or item.records_removed_at is not null
      or not exists (select 1 from public.brand_reviews where lower(email) = lower(item.email)) then
      return jsonb_build_object('state', 'unavailable');
    end if;
    if p_token is null or p_token !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{44}$' then
      raise exception 'Invalid confirmation token' using errcode = '22023';
    end if;
    audit_action := 'privacy_link_requested';
  else
    if item.status <> 'pending' or item.records_removed_at is null then
      return jsonb_build_object('state', 'unavailable');
    end if;
    audit_action := 'privacy_cleanup_requested';
  end if;

  if exists (select 1 from public.admin_audit_events where record_type = 'privacy_request'
    and record_id = p_id::text and action = audit_action and occurred_at > now() - interval '2 minutes') then
    return jsonb_build_object('state', 'cooldown');
  end if;
  if p_action = 'send_link' and (item.status = 'expired' or item.expires_at <= now()) then
    update public.data_deletion_requests set token = p_token, status = 'pending',
      expires_at = now() + interval '24 hours', network_hash = null, ip_address = null
      where id = p_id returning * into item;
  end if;
  insert into public.admin_audit_events(actor_id, action, record_type, record_id, network_hash, outcome)
    values (p_actor, audit_action, 'privacy_request', p_id::text, p_network, 'requested');

  if p_action = 'send_link' then
    return jsonb_build_object('state', 'ready', 'email', item.email, 'token', item.token);
  end if;
  return jsonb_build_object('state', 'ready', 'email', item.email, 'paths', to_jsonb(item.cleanup_paths));
end;
$$;

revoke all on function public.prepare_admin_privacy_assistance(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.prepare_admin_privacy_assistance(uuid, uuid, text, text, text) to service_role;
commit;

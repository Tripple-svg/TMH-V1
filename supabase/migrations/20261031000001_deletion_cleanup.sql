begin;
-- Persist paths before removing reviews, so Storage failures remain retryable.
alter table public.data_deletion_requests
  add column cleanup_paths text[] not null default '{}',
  add column deleted_count integer not null default 0,
  add column records_removed_at timestamptz;
create function public.prepare_saved_review_deletion(p_token text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.data_deletion_requests; lead record; ids text[] := '{}'; paths text[] := '{}';
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select * into r from public.data_deletion_requests where token=p_token for update;
  if not found then return jsonb_build_object('error','Invalid token'); end if;
  if r.status='confirmed' then return jsonb_build_object('error','Already used'); end if;
  -- Expiry must not prevent finishing cleanup after deletion already started.
  if r.records_removed_at is null and (r.status='expired' or r.expires_at<=now()) then
    update public.data_deletion_requests set status='expired' where id=r.id;
    return jsonb_build_object('error','Link expired');
  end if;
  if r.records_removed_at is null then
    for lead in select id,screenshot_url from public.brand_reviews where lower(email)=lower(r.email) for update loop
      ids := array_append(ids,lead.id);
      if nullif(lead.screenshot_url,'') is not null then
        if left(lead.screenshot_url,length(lead.id)+1)<>lead.id||'/'
          or '..'=any(string_to_array(lead.screenshot_url,'/')) then
          raise exception 'Invalid stored screenshot path' using errcode='22023';
        end if;
        paths := array_append(paths,lead.screenshot_url);
      end if;
    end loop;
    delete from public.haven_sessions where review_id=any(ids);
    delete from public.brand_reviews where id=any(ids);
    update public.data_deletion_requests set cleanup_paths=paths,deleted_count=cardinality(ids),records_removed_at=now()
      where id=r.id returning * into r;
  end if;
  return jsonb_build_object('requestId',r.id,'email',r.email,'paths',to_jsonb(r.cleanup_paths),'deleted',r.deleted_count);
end; $$;
create function public.complete_saved_review_deletion(p_request uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  update public.data_deletion_requests set status='confirmed',confirmed_at=now(),cleanup_paths='{}'
    where id=p_request and status='pending' and records_removed_at is not null;
  return found;
end; $$;
revoke all on function public.prepare_saved_review_deletion(text),public.complete_saved_review_deletion(uuid) from public,anon,authenticated;
grant execute on function public.prepare_saved_review_deletion(text),public.complete_saved_review_deletion(uuid) to service_role;
commit;

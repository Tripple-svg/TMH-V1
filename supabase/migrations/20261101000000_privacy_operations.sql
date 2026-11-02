begin;
alter table public.cookie_consents add column if not exists notice_version text;
revoke insert,update,delete on public.cookie_consents from public,anon,authenticated;
grant select,insert on public.cookie_consents to service_role;
-- Keep capability/session metadata for ownership and operational continuity.
-- Expire conversation contents after 180 days with no conversational activity;
-- row count limits alone are not a time retention policy. Never delete purchases.
create function public.expire_inactive_haven_content() returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  delete from public.haven_chat_turns where updated_at<now()-interval '180 days';
  update public.haven_sessions set messages='[]'::jsonb,conversation_memory='{"version":1,"facts":{}}'::jsonb,routing_state='{"problemType":"unknown","permission":"none"}'::jsonb,message_count=0
    where updated_at<now()-interval '180 days' and (coalesce(messages,'[]'::jsonb)<>'[]'::jsonb or conversation_memory is distinct from '{"version":1,"facts":{}}'::jsonb or routing_state is distinct from '{"problemType":"unknown","permission":"none"}'::jsonb);
  get diagnostics n=row_count;
  delete from public.cookie_consents where created_at<now()-interval '2 years';
  return n;
end; $$;
revoke all on function public.expire_inactive_haven_content() from public,anon,authenticated;
grant execute on function public.expire_inactive_haven_content() to service_role;
commit;

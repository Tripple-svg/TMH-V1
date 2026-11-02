begin;

-- Existing saved chat activity only. This does not add a page-view tracker,
-- heartbeat, IP collection or a record of visitors browsing the rest of TMH.
create index if not exists haven_chat_turns_created_session_idx
  on public.haven_chat_turns(created_at,session_id);

create or replace function public.haven_visitor_activity()
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare snapshot_at timestamptz:=now();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  return jsonb_build_object(
    'savedBrowserIdentities',(select count(*) from public.haven_chat_visitors),
    'recentChatIdentities',(
      select count(distinct s.visitor_id)
      from public.haven_chat_turns t join public.haven_sessions s on s.id=t.session_id
      where t.created_at>=snapshot_at-interval '5 minutes' and t.created_at<=snapshot_at
        and s.visitor_id is not null
    ),
    'windowMinutes',5,
    'asOf',snapshot_at
  );
end;
$$;
revoke all on function public.haven_visitor_activity() from public,anon,authenticated;
grant execute on function public.haven_visitor_activity() to service_role;

commit;

begin;
alter table public.flag_alert_notifications add column team_skipped_at timestamptz;
create or replace function public.haven_operational_stats()
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare stats jsonb; pending integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select jsonb_build_object(
    'gemini_replies',count(*) filter(where status='complete' and response->>'model'='gemini'),
    'groq_replies',count(*) filter(where status='complete' and response->>'model'='groq'),
    'failed_turns',count(*) filter(where status='failed'),
    'stale_turns',count(*) filter(where status='processing' and updated_at<now()-interval '75 seconds'))
    into stats from public.haven_chat_turns where created_at>=now()-interval '24 hours';
  select count(*) into pending from public.flag_alert_notifications where (sent_at is null and team_skipped_at is null) or (customer_required and customer_sent_at is null);
  return stats||jsonb_build_object('pending_flag_events',pending,'observed_at',now());
end; $$;

commit;

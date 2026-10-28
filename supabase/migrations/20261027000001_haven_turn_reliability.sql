begin;
alter table public.haven_chat_turns add column processing_attempt uuid,
  add column failure_code text, add column provider_diagnostics jsonb not null default '[]'::jsonb,
  add column retry_after timestamptz;
alter table public.haven_chat_turns drop constraint if exists haven_chat_turns_status_check;
alter table public.haven_chat_turns add constraint haven_chat_turns_status_check check(status in ('processing','complete','failed','cancelled'));
create or replace function public.begin_haven_turn(p_session_id text,p_turn_id text,p_content text,p_has_image boolean,p_substantive boolean,p_explicit_call boolean,p_request_hash text)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare v_session public.haven_sessions; v_review public.brand_reviews; v_turn public.haven_chat_turns; attempt uuid := gen_random_uuid(); linked text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  -- Use the same review -> session lock order as source correction and finish.
  select review_id into linked from public.haven_sessions where id=p_session_id;
  if linked is not null then select * into v_review from public.brand_reviews where id=linked for update; end if;
  select * into v_session from public.haven_sessions where id=p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if exists(select 1 from public.haven_chat_turns where session_id=p_session_id and id<>p_turn_id and status='processing' and updated_at>now()-interval '75 seconds') then return jsonb_build_object('busy',true,'retryAfter',5); end if;
  select * into v_turn from public.haven_chat_turns where id=p_turn_id;
  if found then
    if v_turn.session_id <> p_session_id then raise exception 'Turn access denied' using errcode='42501'; end if;
    if v_turn.input_hash is distinct from p_request_hash then raise exception 'Request ID was reused with different content' using errcode='22023'; end if;
    if v_turn.retry_after>now() then return jsonb_build_object('busy',true,'retryAfter',ceil(extract(epoch from v_turn.retry_after-now()))::integer); end if;
    if v_turn.status='complete' then return jsonb_build_object('cached',v_turn.response,'session',to_jsonb(v_session)); end if;
    if v_turn.status='processing' and v_turn.updated_at>now()-interval '75 seconds' then return jsonb_build_object('busy',true,'retryAfter',5); end if;
    update public.haven_chat_turns set status='processing',processing_attempt=attempt,failure_code=null,provider_diagnostics='[]'::jsonb,retry_after=null,updated_at=now() where id=p_turn_id;
  else
    if exists(select 1 from public.haven_chat_turns where session_id=p_session_id and status='processing' and updated_at>now()-interval '75 seconds') then return jsonb_build_object('busy',true,'retryAfter',5); end if;
    update public.haven_chat_turns set status='failed',processing_attempt=null,updated_at=now() where session_id=p_session_id and status='processing' and updated_at<=now()-interval '75 seconds';
    insert into public.haven_chat_turns(id,session_id,status,input_hash,processing_attempt) values(p_turn_id,p_session_id,'processing',p_request_hash,attempt);
    update public.haven_sessions set messages=(
        select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(coalesce(messages,'[]'::jsonb)||
        jsonb_build_array(jsonb_build_object('id',p_turn_id,'role','user','content',p_content,'hasImage',p_has_image,'timestamp',extract(epoch from now())*1000))) with ordinality a(value,ord)
        where ord>greatest(0,jsonb_array_length(coalesce(messages,'[]'::jsonb))+1-200)),
      total_exchanges=coalesce(total_exchanges,0)+1,message_count=message_count+1,
      diagnostic_answers=least(diagnostic_questions_asked,diagnostic_answers+case when p_substantive then 1 else 0 end),
      explicit_call_requested=explicit_call_requested or p_explicit_call,updated_at=now()
      where id=p_session_id returning * into v_session;
  end if;
  return jsonb_build_object('session',to_jsonb(v_session),'review',case when linked is not null then to_jsonb(v_review) else null end,'attemptId',attempt);
end;
$$;
revoke all on function public.begin_haven_turn(text,text,text,boolean,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.begin_haven_turn(text,text,text,boolean,boolean,boolean,text) to service_role;


create function public.finish_haven_turn(p_session_id text,p_turn_id text,p_attempt_id uuid,p_response jsonb,p_question boolean,p_step text)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare linked text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 select review_id into linked from public.haven_sessions where id=p_session_id;
 if linked is not null then perform id from public.brand_reviews where id=linked for update; end if;
 perform id from public.haven_sessions where id=p_session_id for update;
 perform id from public.haven_chat_turns where id=p_turn_id and session_id=p_session_id and status='processing' and processing_attempt=p_attempt_id for update;
 if not found then raise exception 'Turn attempt no longer active' using errcode='55000'; end if;
 perform public.complete_haven_turn(p_session_id,p_turn_id,p_response,p_question,p_step);
 update public.haven_chat_turns set provider_diagnostics=case when jsonb_typeof(p_response->'providerDiagnostics')='array' then p_response->'providerDiagnostics' else '[]'::jsonb end,
   failure_code=null,retry_after=null where id=p_turn_id and session_id=p_session_id;
end; $$;
create function public.fail_haven_turn(p_session_id text,p_turn_id text,p_attempt_id uuid,p_error_code text,p_diagnostics jsonb,p_retry_seconds integer)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 update public.haven_chat_turns set status='failed',failure_code=left(p_error_code,80),
   provider_diagnostics=case when jsonb_typeof(p_diagnostics)='array' and octet_length(p_diagnostics::text)<2000 then p_diagnostics else '[]'::jsonb end,
   retry_after=now()+make_interval(secs=>least(300,greatest(0,p_retry_seconds))),updated_at=now()
 where id=p_turn_id and session_id=p_session_id and status='processing' and processing_attempt=p_attempt_id;
end; $$;
create function public.cancel_haven_turn(p_session_id text,p_turn_id text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 perform id from public.haven_sessions where id=p_session_id for update;
 update public.haven_chat_turns set status='cancelled',processing_attempt=null,failure_code='user_cancelled',retry_after=null,updated_at=now()
 where id=p_turn_id and session_id=p_session_id and status in ('processing','failed');
 return found;
end; $$;
revoke all on function public.finish_haven_turn(text,text,uuid,jsonb,boolean,text),public.fail_haven_turn(text,text,uuid,text,jsonb,integer),public.cancel_haven_turn(text,text) from public,anon,authenticated;
grant execute on function public.finish_haven_turn(text,text,uuid,jsonb,boolean,text),public.fail_haven_turn(text,text,uuid,text,jsonb,integer),public.cancel_haven_turn(text,text) to service_role;
commit;

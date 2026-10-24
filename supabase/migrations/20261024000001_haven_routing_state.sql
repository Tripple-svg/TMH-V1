begin;
alter table public.haven_sessions add column if not exists routing_state jsonb not null default '{"problemType":"unknown","permission":"none"}'::jsonb;
-- Preserve permission already requested by the trusted server before this upgrade.
update public.haven_sessions set routing_state=jsonb_build_object(
  'problemType',case current_step when 'ROUTING_TO_PLAYBOOK' then 'foundational' when 'ROUTING_TO_CALL' then 'operational' else 'unknown' end,
  'permission',case when current_step='AWAITING_PERMISSION' then 'asked' else 'granted' end
) where current_step in ('AWAITING_PERMISSION','ROUTING_TO_PLAYBOOK','ROUTING_TO_CALL')
  and routing_state='{"problemType":"unknown","permission":"none"}'::jsonb;
create or replace function public.complete_haven_turn(p_session_id text,p_turn_id text,p_response jsonb,p_question boolean,p_step text)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_review_id text;
begin
  select review_id into v_review_id from public.haven_sessions where id=p_session_id;
  if v_review_id is not null then perform id from public.brand_reviews where id=v_review_id for update; end if;
  perform id from public.haven_sessions where id=p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  update public.haven_chat_turns set response=p_response,status='complete',updated_at=now()
    where id=p_turn_id and session_id=p_session_id and status='processing';
  if not found then raise exception 'Turn is not active'; end if;
  update public.haven_sessions set messages=(
    select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(coalesce(messages,'[]'::jsonb)||
      jsonb_build_array(jsonb_build_object('id','reply-'||p_turn_id,'role','agent','content',p_response->>'text','timestamp',extract(epoch from now())*1000))) with ordinality a(value,ord)
      where ord>greatest(0,jsonb_array_length(coalesce(messages,'[]'::jsonb))+1-200)),
    message_count=message_count+1,current_step=p_step,last_step_reached=p_step,
    routing_state=case when jsonb_typeof(p_response->'routingState')='object'
      and p_response->'routingState'->>'problemType' in ('unknown','foundational','operational')
      and p_response->'routingState'->>'permission' in ('none','asked','granted','declined')
      then p_response->'routingState' else routing_state end,
    diagnostic_questions_asked=least(2,diagnostic_questions_asked+case when p_question then 1 else 0 end),updated_at=now()
    where id=p_session_id;
  if p_response->>'leadTemperature' in ('HOT','WARM','COLD') then
    update public.brand_reviews set lead_temperature=initcap(p_response->>'leadTemperature')
      where id=(select review_id from public.haven_sessions where id=p_session_id and scope='audit');
  end if;
end;
$$;
revoke all on function public.complete_haven_turn(text,text,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.complete_haven_turn(text,text,jsonb,boolean,text) to service_role;

commit;

begin;

create or replace function public.ensure_haven_conversation(
  p_visitor_id text, p_token_hash text, p_session_id text, p_scope text,
  p_review_id text, p_service_id text, p_consent_version text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_visitor public.haven_chat_visitors; v_session public.haven_sessions; v_seed text; v_review_id text; v_prior_link text;
  v_user_starts boolean := p_scope = 'support' and p_service_id = 'need-help-new-chat';
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_scope not in ('audit','support','service') or p_consent_version not in ('2026-10-23','2026-10-26') then raise exception 'Invalid conversation request'; end if;
  -- All paths that touch both identities lock the review before its visitors/sessions.
  select review_id into v_prior_link from public.haven_chat_visitors where id=p_visitor_id;
  if coalesce(p_review_id,v_prior_link) is not null then
    perform id from public.brand_reviews where id=coalesce(p_review_id,v_prior_link) for update;
    if not found then raise exception 'Review not found' using errcode='42501'; end if;
  end if;
  insert into public.haven_chat_visitors(id,token_hash) values(p_visitor_id,p_token_hash) on conflict(id) do nothing;
  select * into v_visitor from public.haven_chat_visitors where id=p_visitor_id for update;
  if v_visitor.token_hash is distinct from p_token_hash then raise exception 'Visitor access denied' using errcode='42501'; end if;
  if v_visitor.review_id is distinct from v_prior_link then raise exception 'Visitor linkage changed; retry' using errcode='40001'; end if;
  if p_review_id is not null then
    if v_visitor.review_id is not null and v_visitor.review_id <> p_review_id then raise exception 'Visitor belongs to another saved review' using errcode='42501'; end if;
    update public.haven_chat_visitors set review_id=p_review_id,updated_at=now() where id=p_visitor_id;
    -- Only a handler holding the saved review capability may supply p_review_id.
    update public.haven_sessions set review_id=p_review_id where visitor_id=p_visitor_id and review_id is null;
  end if;
  v_review_id := coalesce(p_review_id,v_visitor.review_id);
  select * into v_session from public.haven_sessions where id=p_session_id for update;
  if found then
    if v_session.scope <> p_scope or (v_session.visitor_id is not null and v_session.visitor_id <> p_visitor_id)
      or (v_session.review_id is not null and v_session.review_id is distinct from v_review_id)
      or (v_session.visitor_id is null and p_scope <> 'audit') then
      raise exception 'Session access denied' using errcode='42501';
    end if;
    if p_scope='audit' and (p_review_id is null or v_session.review_id <> p_review_id) then raise exception 'Audit access denied' using errcode='42501'; end if;
    update public.haven_sessions set visitor_id=p_visitor_id,
      review_id=coalesce(review_id,v_review_id),consent_version=p_consent_version,consent_at=coalesce(consent_at,now()),
      diagnostic_questions_asked=greatest(diagnostic_questions_asked,case when scope='audit' then 1 else 0 end)
    where id=p_session_id returning * into v_session;
    -- A saved Plus chat may still have the old server-generated opener.
    if v_user_starts and v_session.service_id is null
      and v_session.messages->0->>'id' = 'seed-' || p_session_id
      and v_session.messages->0->>'isSeedGreeting' = 'true' then
      update public.haven_sessions
      set messages = messages - 0, message_count = greatest(message_count - 1, 0),
        diagnostic_questions_asked = greatest(diagnostic_questions_asked - 1, 0),
        diagnostic_answers = least(diagnostic_answers, greatest(diagnostic_questions_asked - 1, 0)),
        updated_at = now()
      where id=p_session_id returning * into v_session;
    end if;
  else
    if p_scope='audit' then raise exception 'Audit session not found' using errcode='42501'; end if;
    v_seed := case
      when v_user_starts then null
      when p_scope = 'service' then 'What would you like to improve, and what is getting in the way right now?'
      when p_service_id = 'team-inquiry' then 'Before I do, what''s this about?'
      when p_service_id = 'site-support' then 'What can I help you with?'
      else 'Do you need help with your marketing or finding something on this website?'
    end;
    insert into public.haven_sessions(id,visitor_id,review_id,scope,service_id,messages,current_step,last_step_reached,
      diagnostic_questions_asked,message_count,consent_version,consent_at)
    values(p_session_id,p_visitor_id,v_review_id,p_scope,case when v_user_starts then null else p_service_id end,
      case when v_seed is null then '[]'::jsonb else
        jsonb_build_array(jsonb_build_object('id','seed-'||p_session_id,'role','agent','content',v_seed,'isSeedGreeting',true,'timestamp',extract(epoch from now())*1000)) end,
      case when p_scope='service' then 'SERVICE_GRID_OPEN' else 'CUSTOMER_SUPPORT_OPEN' end,
      case when p_scope='service' then 'SERVICE_GRID_OPEN' else 'CUSTOMER_SUPPORT_OPEN' end,
      case when v_seed is null then 0 else 1 end, case when v_seed is null then 0 else 1 end,p_consent_version,now()) returning * into v_session;
  end if;
  select * into v_visitor from public.haven_chat_visitors where id=p_visitor_id;
  return jsonb_build_object('session',to_jsonb(v_session),'visitor',to_jsonb(v_visitor)-'token_hash');
end;
$$;

commit;

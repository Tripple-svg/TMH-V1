begin;
alter table public.brand_reviews add column score_reason text;
alter table public.brand_reviews add column moderation_strikes integer not null default 0 check(moderation_strikes between 0 and 3);
alter table public.haven_chat_visitors add column moderation_strikes integer not null default 0 check(moderation_strikes between 0 and 3);
update public.brand_reviews set moderation_strikes=case flag_status when 'red' then 3 when 'yellow' then 2 else 0 end;
update public.haven_chat_visitors set moderation_strikes=case flag_status when 'red' then 3 when 'yellow' then 2 else 0 end;
alter table public.flag_alert_notifications add column entry_point text;
alter table public.brand_reviews add column welcome_template_version text not null default 'editorial-v1';
alter table public.brand_reviews alter column welcome_template_version set default 'editorial-v2';
alter table public.playbook_purchases alter column email_template_version set default 'editorial-v2';
alter table public.flag_alert_notifications alter column email_template_version set default 'editorial-v2';

create function public.reset_haven_strike_status()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.flag_status is distinct from new.flag_status then
    new.moderation_strikes := case new.flag_status when 'red' then 3 when 'yellow' then 2 else 0 end;
  end if;
  return new;
end; $$;
create trigger reset_review_strike_status before update on public.brand_reviews for each row execute function public.reset_haven_strike_status();
create trigger reset_visitor_strike_status before update on public.haven_chat_visitors for each row execute function public.reset_haven_strike_status();
CREATE OR REPLACE FUNCTION public.snapshot_flag_notification_context()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE chat public.haven_sessions; requested_session TEXT;
BEGIN
  NEW.source := CASE WHEN NEW.review_id IS NOT NULL THEN 'lead' ELSE 'admin' END;
  IF NEW.review_id IS NOT NULL THEN
    SELECT full_name INTO NEW.full_name FROM public.brand_reviews WHERE id=NEW.review_id;
  END IF;
  requested_session := nullif(current_setting('haven.moderation_session_id',true),'');
  IF requested_session IS NOT NULL THEN
    SELECT * INTO chat FROM public.haven_sessions WHERE id=requested_session
      AND ((NEW.review_id IS NOT NULL AND review_id=NEW.review_id)
        OR (NEW.visitor_id IS NOT NULL AND visitor_id=NEW.visitor_id));
    IF FOUND THEN
      NEW.session_id := chat.id;
      NEW.entry_point := CASE WHEN chat.service_id='team-inquiry' THEN 'team_inquiry' ELSE chat.scope END;
      NEW.source := CASE WHEN chat.scope='audit' THEN 'lead' ELSE chat.scope END;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.apply_haven_ai_flag(p_review_id TEXT,p_visitor_id TEXT,p_event_key TEXT,p_reason TEXT,p_session_id TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  linked_id TEXT; locked_link TEXT; review_status TEXT; visitor_status TEXT; current_status TEXT;
  inserted_count INTEGER; changed BOOLEAN := false; strike_count INTEGER := 0; next_status TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  PERFORM set_config('haven.moderation_session_id',coalesce(p_session_id,''),true);
  IF (p_review_id IS NULL AND p_visitor_id IS NULL) OR p_event_key IS NULL OR p_event_key !~ '^[A-Za-z0-9:_-]{1,160}$'
    OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Invalid moderation event' USING ERRCODE='22023';
  END IF;
  IF p_visitor_id IS NOT NULL THEN
    SELECT review_id,flag_status INTO linked_id,visitor_status FROM public.haven_chat_visitors WHERE id=p_visitor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Visitor not found' USING ERRCODE='P0002'; END IF;
    IF linked_id IS NOT NULL AND p_review_id IS NOT NULL AND linked_id<>p_review_id THEN
      RAISE EXCEPTION 'Moderation identity mismatch' USING ERRCODE='22023';
    END IF;
    p_review_id := coalesce(p_review_id,linked_id);
  END IF;
  IF p_review_id IS NOT NULL THEN
    SELECT flag_status INTO review_status FROM public.brand_reviews WHERE id=p_review_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review not found' USING ERRCODE='P0002'; END IF;
  END IF;
  IF p_visitor_id IS NOT NULL THEN
    SELECT review_id,flag_status INTO locked_link,visitor_status FROM public.haven_chat_visitors WHERE id=p_visitor_id FOR UPDATE;
    IF locked_link IS DISTINCT FROM linked_id THEN RAISE EXCEPTION 'Visitor linkage changed; retry' USING ERRCODE='40001'; END IF;
  END IF;
  current_status := CASE WHEN review_status='red' OR visitor_status='red' THEN 'red'
    WHEN review_status='yellow' OR visitor_status='yellow' THEN 'yellow' ELSE 'white' END;
  INSERT INTO public.haven_moderation_events (event_key,review_id,visitor_id,reason)
  VALUES (p_event_key,p_review_id,p_visitor_id,trim(p_reason)) ON CONFLICT (event_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  SELECT greatest(
    coalesce((SELECT moderation_strikes FROM public.brand_reviews WHERE id=p_review_id),0),
    coalesce((SELECT moderation_strikes FROM public.haven_chat_visitors WHERE id=p_visitor_id),0),
    CASE current_status WHEN 'red' THEN 3 WHEN 'yellow' THEN 2 ELSE 0 END
  ) INTO strike_count;
  IF inserted_count>0 THEN
    strike_count := least(3,strike_count+1);
    next_status := CASE WHEN strike_count>=3 THEN 'red' WHEN strike_count=2 THEN 'yellow' ELSE 'white' END;
    changed := next_status IS DISTINCT FROM current_status;
    IF p_review_id IS NOT NULL THEN
      UPDATE public.brand_reviews SET flag_status=next_status,flag_reason=trim(p_reason),moderation_strikes=strike_count WHERE id=p_review_id;
      UPDATE public.haven_chat_visitors SET moderation_strikes=strike_count WHERE review_id=p_review_id;
    ELSE
      UPDATE public.haven_chat_visitors SET flag_status=next_status,flag_reason=trim(p_reason),moderation_strikes=strike_count WHERE id=p_visitor_id;
    END IF;
    current_status := next_status;
  END IF;
  RETURN jsonb_build_object('flagStatus',current_status,'changed',changed,'strikes',strike_count,'reviewId',p_review_id,'visitorId',p_visitor_id);
END; $$;
CREATE OR REPLACE FUNCTION public.set_haven_moderation_flag(p_email TEXT,p_visitor_id TEXT,p_status TEXT,p_reason TEXT,p_session_id TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_review TEXT; target_visitor TEXT; locked_link TEXT; saved_review JSONB; saved_visitor JSONB;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  PERFORM set_config('haven.moderation_session_id',coalesce(p_session_id,''),true);
  IF p_status IS NULL OR p_status NOT IN ('white','yellow','red') OR (p_email IS NULL AND p_visitor_id IS NULL)
    OR (p_email IS NOT NULL AND p_visitor_id IS NOT NULL) OR length(coalesce(p_reason,''))>2000 THEN
    RAISE EXCEPTION 'Invalid moderation target' USING ERRCODE='22023';
  END IF;
  IF p_visitor_id IS NOT NULL THEN
    SELECT id,review_id INTO target_visitor,target_review FROM public.haven_chat_visitors WHERE id=p_visitor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Visitor not found' USING ERRCODE='P0002'; END IF;
  ELSE
    SELECT id INTO target_review FROM public.brand_reviews WHERE lower(email)=lower(trim(p_email)) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review not found' USING ERRCODE='P0002'; END IF;
  END IF;
  IF target_review IS NOT NULL THEN
    PERFORM id FROM public.brand_reviews WHERE id=target_review FOR UPDATE;
  END IF;
  IF target_visitor IS NOT NULL THEN
    SELECT review_id INTO locked_link FROM public.haven_chat_visitors WHERE id=target_visitor FOR UPDATE;
    IF locked_link IS DISTINCT FROM target_review THEN RAISE EXCEPTION 'Visitor linkage changed; retry' USING ERRCODE='40001'; END IF;
  END IF;
  IF target_review IS NOT NULL THEN
    UPDATE public.brand_reviews SET flag_status=p_status,flag_reason=p_reason,moderation_strikes=CASE p_status WHEN 'red' THEN 3 WHEN 'yellow' THEN 2 ELSE 0 END WHERE id=target_review;
    SELECT jsonb_build_object('id',id,'flag_status',flag_status,'flag_reason',flag_reason,'moderation_strikes',moderation_strikes) INTO saved_review
      FROM public.brand_reviews WHERE id=target_review;
  ELSE
    UPDATE public.haven_chat_visitors SET flag_status=p_status,flag_reason=p_reason,moderation_strikes=CASE p_status WHEN 'red' THEN 3 WHEN 'yellow' THEN 2 ELSE 0 END WHERE id=target_visitor;
  END IF;
  IF target_review IS NOT NULL THEN
    UPDATE public.haven_chat_visitors SET moderation_strikes=CASE p_status WHEN 'red' THEN 3 WHEN 'yellow' THEN 2 ELSE 0 END WHERE review_id=target_review;
  END IF;
  IF target_visitor IS NOT NULL THEN
    SELECT jsonb_build_object('id',id,'flag_status',flag_status,'flag_reason',flag_reason,'moderation_strikes',moderation_strikes) INTO saved_visitor
      FROM public.haven_chat_visitors WHERE id=target_visitor;
  END IF;
  RETURN jsonb_build_object('review',saved_review,'visitor',saved_visitor,'flagStatus',p_status,'reviewId',target_review,'visitorId',target_visitor);
END; $$;
create or replace function public.ensure_haven_conversation(
  p_visitor_id text, p_token_hash text, p_session_id text, p_scope text,
  p_review_id text, p_service_id text, p_consent_version text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_visitor public.haven_chat_visitors; v_session public.haven_sessions; v_seed text; v_review_id text; v_prior_link text;
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
  else
    if p_scope='audit' then raise exception 'Audit session not found' using errcode='42501'; end if;
    v_seed := case when p_scope='service' then case p_service_id
      when 'web' then 'Which part of your website or brand are you looking to improve, and what is going wrong there?'
      when 'growth' then 'What are you trying to grow, and where is progress getting stuck?'
      when 'content' then 'Who are you trying to reach, and what is your content struggling to achieve?'
      else 'What are you building, and where do you need help?' end
      else case when p_service_id='team-inquiry' then 'What would you like to discuss with the TMH team, and what are you hoping to improve?' else 'What is going on with your brand, or what do you need help with today?' end end;
    insert into public.haven_sessions(id,visitor_id,review_id,scope,service_id,messages,current_step,last_step_reached,
      diagnostic_questions_asked,message_count,consent_version,consent_at)
    values(p_session_id,p_visitor_id,v_review_id,p_scope,p_service_id,
      jsonb_build_array(jsonb_build_object('id','seed-'||p_session_id,'role','agent','content',v_seed,'isSeedGreeting',true,'timestamp',extract(epoch from now())*1000)),
      case when p_scope='service' then 'SERVICE_GRID_OPEN' else 'CUSTOMER_SUPPORT_OPEN' end,
      case when p_scope='service' then 'SERVICE_GRID_OPEN' else 'CUSTOMER_SUPPORT_OPEN' end,1,1,p_consent_version,now()) returning * into v_session;
  end if;
  select * into v_visitor from public.haven_chat_visitors where id=p_visitor_id;
  return jsonb_build_object('session',to_jsonb(v_session),'visitor',to_jsonb(v_visitor)-'token_hash');
end;
$$;
revoke all on function public.ensure_haven_conversation(text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ensure_haven_conversation(text,text,text,text,text,text,text) to service_role;

create or replace function public.begin_haven_turn(p_session_id text,p_turn_id text,p_content text,p_has_image boolean,p_substantive boolean,p_explicit_call boolean,p_request_hash text)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare v_session public.haven_sessions; v_turn public.haven_chat_turns;
begin
  select * into v_session from public.haven_sessions where id=p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  select * into v_turn from public.haven_chat_turns where id=p_turn_id;
  if found then
    if v_turn.session_id <> p_session_id then raise exception 'Turn access denied' using errcode='42501'; end if;
    if v_turn.input_hash is distinct from p_request_hash then raise exception 'Request ID was reused with different content' using errcode='22023'; end if;
    if v_turn.status='complete' then return jsonb_build_object('cached',v_turn.response,'session',to_jsonb(v_session)); end if;
    if v_turn.status='processing' and v_turn.updated_at>now()-interval '75 seconds' then return jsonb_build_object('busy',true); end if;
    update public.haven_chat_turns set status='processing',updated_at=now() where id=p_turn_id;
  else
    if exists(select 1 from public.haven_chat_turns where session_id=p_session_id and status='processing' and updated_at>now()-interval '75 seconds') then return jsonb_build_object('busy',true); end if;
    insert into public.haven_chat_turns(id,session_id,status,input_hash) values(p_turn_id,p_session_id,'processing',p_request_hash);
    update public.haven_sessions set messages=(
        select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(coalesce(messages,'[]'::jsonb)||
        jsonb_build_array(jsonb_build_object('id',p_turn_id,'role','user','content',p_content,'hasImage',p_has_image,'timestamp',extract(epoch from now())*1000))) with ordinality a(value,ord)
        where ord>greatest(0,jsonb_array_length(coalesce(messages,'[]'::jsonb))+1-200)),
      total_exchanges=coalesce(total_exchanges,0)+1,message_count=message_count+1,
      diagnostic_answers=least(diagnostic_questions_asked,diagnostic_answers+case when p_substantive then 1 else 0 end),
      explicit_call_requested=explicit_call_requested or p_explicit_call,updated_at=now()
      where id=p_session_id returning * into v_session;
  end if;
  return jsonb_build_object('session',to_jsonb(v_session));
end;
$$;
revoke all on function public.begin_haven_turn(text,text,text,boolean,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.begin_haven_turn(text,text,text,boolean,boolean,boolean,text) to service_role;


alter table public.haven_sessions add column if not exists conversation_memory jsonb not null default '{"version":1,"facts":{}}'::jsonb;
create or replace function public.complete_haven_turn(p_session_id text,p_turn_id text,p_response jsonb,p_question boolean,p_step text)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_review_id text;
begin
  select review_id into v_review_id from public.haven_sessions where id=p_session_id;
  if v_review_id is not null then perform id from public.brand_reviews where id=v_review_id for update; end if;
  perform id from public.haven_sessions where id=p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  update public.haven_chat_turns set response=p_response-'conversationMemory',status='complete',updated_at=now()
    where id=p_turn_id and session_id=p_session_id and status='processing';
  if not found then raise exception 'Turn is not active'; end if;
  update public.haven_sessions set messages=(
    select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(coalesce(messages,'[]'::jsonb)||
      jsonb_build_array(jsonb_build_object('id','reply-'||p_turn_id,'role','agent','content',p_response->>'text','timestamp',extract(epoch from now())*1000))) with ordinality a(value,ord)
      where ord>greatest(0,jsonb_array_length(coalesce(messages,'[]'::jsonb))+1-200)),
    message_count=message_count+1,current_step=p_step,last_step_reached=p_step,
    conversation_memory=case when p_response->'conversationMemory'->>'version'='1'
      and jsonb_typeof(p_response->'conversationMemory'->'facts')='object'
      and octet_length((p_response->'conversationMemory')::text)<=6000
      then p_response->'conversationMemory' else conversation_memory end,
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

-- Team enquiry workflow is separate from AI conversation and access flags.
alter table public.haven_sessions
  add column inquiry_status text not null default 'new' check(inquiry_status in ('new','reviewing','contacted','booked','closed','lost')),
  add column inquiry_owner text check(length(inquiry_owner)<=80),
  add column inquiry_notes text not null default '' check(length(inquiry_notes)<=4000),
  add column inquiry_next_followup_on date,
  add column inquiry_revision integer not null default 0,
  add column inquiry_updated_at timestamptz;
create function public.update_haven_inquiry(p_session_id text,p_revision integer,p_status text,p_owner text,p_notes text,p_followup date)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare chat public.haven_sessions; conflict boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_revision is null or p_revision<0 or p_status is null or p_status not in ('new','reviewing','contacted','booked','closed','lost')
    or length(coalesce(p_owner,''))>80 or length(coalesce(p_notes,''))>4000 then raise exception 'Invalid enquiry update' using errcode='22023'; end if;
  select * into chat from public.haven_sessions where id=p_session_id and scope='support' and service_id='team-inquiry' for update;
  if not found then raise exception 'Team inquiry not found' using errcode='P0002'; end if;
  conflict := chat.inquiry_revision<>p_revision;
  if not conflict then
    update public.haven_sessions set inquiry_status=p_status,inquiry_owner=nullif(trim(p_owner),''),inquiry_notes=coalesce(p_notes,''),
      inquiry_next_followup_on=p_followup,inquiry_revision=inquiry_revision+1,inquiry_updated_at=now()
      where id=p_session_id returning * into chat;
  end if;
  return jsonb_build_object('conflict',conflict,'session',jsonb_build_object('id',chat.id,'inquiry_status',chat.inquiry_status,
    'inquiry_owner',chat.inquiry_owner,'inquiry_notes',chat.inquiry_notes,'inquiry_next_followup_on',chat.inquiry_next_followup_on,
    'inquiry_revision',chat.inquiry_revision,'inquiry_updated_at',chat.inquiry_updated_at));
end; $$;
revoke all on function public.update_haven_inquiry(text,integer,text,text,text,date) from public,anon,authenticated;
grant execute on function public.update_haven_inquiry(text,integer,text,text,text,date) to service_role;

create index haven_chat_turns_recent_idx on public.haven_chat_turns(created_at);
create function public.haven_operational_stats()
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
  select count(*) into pending from public.flag_alert_notifications where sent_at is null or (customer_required and customer_sent_at is null);
  return stats||jsonb_build_object('pending_flag_events',pending,'observed_at',now());
end; $$;
revoke all on function public.haven_operational_stats() from public,anon,authenticated;
grant execute on function public.haven_operational_stats() to service_role;

commit;

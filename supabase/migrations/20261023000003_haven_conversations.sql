begin;
create table public.haven_chat_visitors (
  id text primary key,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  review_id text references public.brand_reviews(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.haven_chat_visitors enable row level security;
revoke all on public.haven_chat_visitors from public, anon, authenticated;
grant all on public.haven_chat_visitors to service_role;

alter table public.haven_sessions
  add column if not exists visitor_id text references public.haven_chat_visitors(id) on delete set null,
  add column if not exists message_count integer not null default 0,
  add column if not exists diagnostic_questions_asked integer not null default 0,
  add column if not exists diagnostic_answers integer not null default 0,
  add column if not exists explicit_call_requested boolean not null default false,
  add column if not exists consent_version text,
  add column if not exists consent_at timestamptz;
update public.haven_sessions set message_count = jsonb_array_length(coalesce(messages, '[]'::jsonb)),
  diagnostic_questions_asked = case when scope = 'audit' then 1 else 0 end;
create index haven_sessions_visitor_idx on public.haven_sessions(visitor_id, updated_at desc);
create index haven_sessions_review_scope_idx on public.haven_sessions(review_id, scope, updated_at desc);

create table public.haven_chat_turns (
  id text primary key,
  session_id text not null references public.haven_sessions(id) on delete cascade,
  status text not null check (status in ('processing', 'failed', 'complete')),
  input_hash text not null,
  response jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.haven_chat_turns enable row level security;
revoke all on public.haven_chat_turns from public, anon, authenticated;
grant all on public.haven_chat_turns to service_role;

create or replace function public.ensure_haven_conversation(
  p_visitor_id text, p_token_hash text, p_session_id text, p_scope text,
  p_review_id text, p_service_id text, p_consent_version text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_visitor public.haven_chat_visitors; v_session public.haven_sessions; v_seed text; v_review_id text; v_prior_link text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_scope not in ('audit','support','service') or p_consent_version <> '2026-10-23' then raise exception 'Invalid conversation request'; end if;
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
      else 'What is going on with your brand, or what do you need help with today?' end;
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
    if v_turn.status='processing' and v_turn.updated_at>now()-interval '3 minutes' then return jsonb_build_object('busy',true); end if;
    update public.haven_chat_turns set status='processing',updated_at=now() where id=p_turn_id;
  else
    if exists(select 1 from public.haven_chat_turns where session_id=p_session_id and status='processing' and updated_at>now()-interval '3 minutes') then return jsonb_build_object('busy',true); end if;
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

-- Once server-owned turns are active, browser snapshots must not replace them.
create or replace function public.sync_haven_review(p_session_id text,p_review_id text,p_messages jsonb,p_snapshot_at timestamptz,p_clicked_booking boolean default false,p_clicked_playbook boolean default false)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform id from public.brand_reviews where id=p_review_id for update;
  if not found then raise exception 'Review no longer exists'; end if;
  perform id from public.haven_sessions where id=p_session_id and review_id=p_review_id and scope='audit' for update;
  if not found then raise exception 'Session no longer exists'; end if;
  update public.haven_sessions set messages=p_messages,message_count=jsonb_array_length(p_messages),
    last_client_sync_at=p_snapshot_at,updated_at=now()
    where id=p_session_id and p_messages is not null and visitor_id is null and (last_client_sync_at is null or last_client_sync_at<p_snapshot_at);
  update public.brand_reviews set clicked_booking_link=coalesce(clicked_booking_link,false) or p_clicked_booking,
    clicked_playbook_link=coalesce(clicked_playbook_link,false) or p_clicked_playbook,
    clicked_booking_at=case when p_clicked_booking then coalesce(clicked_booking_at,now()) else clicked_booking_at end,
    clicked_playbook_at=case when p_clicked_playbook then coalesce(clicked_playbook_at,now()) else clicked_playbook_at end,
    updated_at=now() where id=p_review_id;
end;
$$;
commit;

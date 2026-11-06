begin;
-- Ownership is verified by update-review-source before this service-only call.
-- Keep the same access, purchases, bookings, moderation and usage budgets.
create function public.revise_haven_review(p_review_id text,p_revision integer,p_name text,p_brand text,p_phone text,p_goal text,p_restart boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.brand_reviews;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into r from public.brand_reviews where id=p_review_id for update;
  if not found then raise exception 'Review not found' using errcode='P0002'; end if;
  if r.flag_status='red' then raise exception 'Review restricted' using errcode='42501'; end if;
  if p_revision is null or r.scoring_revision<>p_revision then return jsonb_build_object('conflict',true,'revision',r.scoring_revision); end if;
  if p_name is null or length(trim(p_name)) not between 1 and 120
    or p_brand is null or length(trim(p_brand)) not between 1 and 200
    or p_phone is null or length(trim(p_phone)) not between 1 and 40
    or p_goal is null or length(p_goal)>500 or p_restart is null then
    raise exception 'Invalid review details' using errcode='22023';
  end if;
  perform id from public.haven_sessions where review_id=p_review_id order by id for update;
  if exists(select 1 from public.haven_chat_turns t join public.haven_sessions s on s.id=t.session_id
    where s.review_id=p_review_id and t.status='processing' and t.updated_at>now()-interval '90 seconds') then
    raise exception 'Wait for the current reply before changing this review' using errcode='55000';
  end if;
  -- An expired in-flight completion must not restore the previous diagnosis.
  update public.haven_chat_turns t set status='cancelled',response=null,updated_at=now() from public.haven_sessions s
    where s.id=t.session_id and s.review_id=p_review_id;
  update public.brand_reviews set full_name=trim(p_name),brand_name=trim(p_brand),whatsapp=trim(p_phone),main_goal=trim(p_goal),
    scoring_revision=scoring_revision+1,rubric_version=null,score_evidence=null,haven_score=null,score_breakdown=null,
    biggest_leak=null,biggest_problems='{}',assessment_summary=null,pre_call_briefing=null,score_reason=null,score_observed_at=null,
    scraped_summary=null,scrape_state=null,lead_temperature='Cold',updated_at=now()
    where id=p_review_id returning * into r;
  update public.haven_sessions set conversation_memory='{"version":1,"facts":{}}'::jsonb,
    routing_state='{"version":2,"need":"unknown","permission":"none"}'::jsonb,
    current_step=case when scope='audit' then 'AWAITING_DIAGNOSTIC_Q1' when scope='service' then 'SERVICE_GRID_OPEN' else 'CUSTOMER_SUPPORT_OPEN' end,
    diagnostic_questions_asked=0,diagnostic_answers=0,updated_at=now() where review_id=p_review_id;
  -- Disable legacy browser-snapshot replacement, including from an older tab.
  -- Future messages are saved only by the server-owned turn functions.
  update public.haven_sessions set last_client_sync_at='infinity'::timestamptz where review_id=p_review_id and scope='audit';
  if p_restart then
    delete from public.haven_chat_turns where session_id in(select id from public.haven_sessions where review_id=p_review_id and scope='audit');
    update public.haven_sessions set messages='[]'::jsonb,message_count=0,total_exchanges=0,last_step_reached=null
      where review_id=p_review_id and scope='audit';
  end if;
  return jsonb_build_object('revision',r.scoring_revision,'review',jsonb_build_object(
    'id',r.id,'full_name',r.full_name,'brand_name',r.brand_name,'whatsapp',r.whatsapp,'main_goal',r.main_goal));
end; $$;
revoke all on function public.revise_haven_review(text,integer,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.revise_haven_review(text,integer,text,text,text,text,boolean) to service_role;
commit;

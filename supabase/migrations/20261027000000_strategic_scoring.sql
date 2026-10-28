begin;
alter table public.brand_reviews
  add column rubric_version text,
  add column score_evidence jsonb,
  add column scoring_revision integer not null default 0 check(scoring_revision>=0),
  add column score_source_hash text;
alter table public.brand_reviews drop constraint if exists brand_reviews_scrape_state_check;
alter table public.brand_reviews add constraint brand_reviews_scrape_state_check
  check(scrape_state in ('valid','bad_data','insufficient_evidence','failed'));

-- Called only after the handler verifies the review/session bearer capability.
-- A revision guards against a stale scoring response overwriting corrected input.
create function public.correct_haven_review_source(p_review_id text,p_revision integer,p_url text,p_screenshot_path text,p_source_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.brand_reviews; old_path text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into r from public.brand_reviews where id=p_review_id for update;
  if not found then raise exception 'Review not found' using errcode='P0002'; end if;
  if r.flag_status='red' then raise exception 'Review restricted' using errcode='42501'; end if;
  if p_revision is null or r.scoring_revision<>p_revision then return jsonb_build_object('conflict',true,'revision',r.scoring_revision); end if;
  if exists(select 1 from public.haven_chat_turns t join public.haven_sessions s on s.id=t.session_id
    where s.review_id=p_review_id and s.scope='audit' and t.status='processing' and t.updated_at>now()-interval '90 seconds') then
    raise exception 'Wait for the current reply or stop it before correcting the source' using errcode='55000';
  end if;
  update public.haven_chat_turns t set status='failed',updated_at=now() from public.haven_sessions s
    where s.id=t.session_id and s.review_id=p_review_id and s.scope='audit' and t.status='processing';
  if r.platform_type='website' then
    if p_url is null or length(p_url)>2048 or p_url !~ '^https?://' or p_screenshot_path is not null then raise exception 'Invalid website correction' using errcode='22023'; end if;
  elsif r.platform_type='social' then
    if p_url is not null or p_screenshot_path is null or p_screenshot_path not like r.id||'/source-%'
      or p_source_hash is null or p_source_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid screenshot correction' using errcode='22023'; end if;
  else raise exception 'No review source' using errcode='22023'; end if;
  old_path := r.screenshot_url;
  update public.brand_reviews set website_url=case when platform_type='website' then p_url else website_url end,
    screenshot_url=case when platform_type='social' then p_screenshot_path else screenshot_url end,
    score_source_hash=p_source_hash,scoring_revision=scoring_revision+1,rubric_version=null,score_evidence=null,
    haven_score=null,score_breakdown=null,biggest_leak=null,score_reason=null,score_observed_at=null,scraped_summary=null,scrape_state=null,
    updated_at=now() where id=p_review_id returning * into r;
  update public.haven_sessions set routing_state='{"problemType":"unknown","permission":"none"}'::jsonb,
    -- Retain the owner's business facts; discard source-dependent problem and
    -- attempted-fix notes so a wrong URL cannot carry its diagnosis forward.
    conversation_memory=jsonb_build_object('version',1,'facts',coalesce((
      select jsonb_object_agg(key,value) from jsonb_each(case when jsonb_typeof(conversation_memory->'facts')='object'
        then conversation_memory->'facts' else '{}'::jsonb end)
      where key in ('business','audience','goal','constraints','preference')
    ),'{}'::jsonb)),current_step='AWAITING_DIAGNOSTIC_Q1',
    diagnostic_questions_asked=0,diagnostic_answers=0,updated_at=now()
    where review_id=p_review_id and scope='audit';
  return jsonb_build_object('conflict',false,'revision',r.scoring_revision,'oldScreenshotPath',old_path,'review',
    jsonb_build_object('id',r.id,'website_url',r.website_url,'screenshot_url',r.screenshot_url,'platform_type',r.platform_type));
end; $$;
revoke all on function public.correct_haven_review_source(text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.correct_haven_review_source(text,integer,text,text,text) to service_role;
commit;

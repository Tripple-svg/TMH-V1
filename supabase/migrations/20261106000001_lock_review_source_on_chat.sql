begin;
drop function if exists public.revise_haven_review(text,integer,text,text,text,text,boolean);

alter table public.brand_reviews add column source_locked_at timestamptz;
update public.brand_reviews r set source_locked_at=now()
where exists (
  select 1 from public.haven_sessions s where s.review_id=r.id and s.scope='audit'
    and (s.total_exchanges>0 or s.messages @> '[{"role":"user"}]'::jsonb
      or exists (select 1 from public.haven_chat_turns t where t.session_id=s.id))
);

create function public.lock_haven_review_source(p_review_id text,p_revision integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.brand_reviews;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into r from public.brand_reviews where id=p_review_id for update;
  if not found or r.flag_status='red' then raise exception 'Review access denied' using errcode='42501'; end if;
  if r.scoring_revision is distinct from p_revision then return jsonb_build_object('conflict',true,'revision',r.scoring_revision); end if;
  if r.source_locked_at is not null then return jsonb_build_object('locked',true,'revision',r.scoring_revision); end if;
  update public.brand_reviews set source_locked_at=now() where id=r.id;
  return jsonb_build_object('locked',true,'revision',r.scoring_revision);
end;
$$;
revoke all on function public.lock_haven_review_source(text,integer) from public,anon,authenticated;
grant execute on function public.lock_haven_review_source(text,integer) to service_role;

-- Cover older clients that skip Continue to Chat and post the first turn.
-- begin_haven_turn already takes the review row lock before inserting the turn.
create function public.lock_source_on_audit_turn()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  update public.brand_reviews r set source_locked_at=now()
  from public.haven_sessions s
  where s.id=new.session_id and s.scope='audit' and s.review_id=r.id and r.source_locked_at is null;
  return new;
end;
$$;
create trigger lock_source_on_audit_turn after insert on public.haven_chat_turns
for each row execute function public.lock_source_on_audit_turn();

-- The same row lock serializes a source correction and a chat start.
create function public.protect_locked_review_source()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.source_locked_at is not null and (
    new.source_locked_at is distinct from old.source_locked_at
    or new.website_url is distinct from old.website_url
    or new.screenshot_url is distinct from old.screenshot_url
    or new.platform_type is distinct from old.platform_type
    or new.scoring_revision is distinct from old.scoring_revision
    or new.score_observed_at is distinct from old.score_observed_at
  ) then raise exception 'The review source is locked' using errcode='P0003'; end if;
  return new;
end;
$$;
create trigger protect_locked_review_source before update of source_locked_at,website_url,screenshot_url,platform_type,scoring_revision,score_observed_at on public.brand_reviews
for each row execute function public.protect_locked_review_source();
commit;

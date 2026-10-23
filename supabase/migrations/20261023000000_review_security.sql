-- Apply before deploying the matching create/chat/scoring/sync functions and frontend.
begin;

alter table public.brand_reviews
  add column if not exists agreed_to_terms boolean not null default false,
  add column if not exists agreed_at timestamptz,
  add column if not exists score_breakdown jsonb,
  add column if not exists scrape_state text check (scrape_state in ('valid', 'bad_data', 'failed')),
  add column if not exists scraped_summary text,
  add column if not exists score_observed_at timestamptz;

alter table public.haven_sessions add column if not exists last_client_sync_at timestamptz;

create table if not exists public.review_access_tokens (
  review_id text primary key references public.brand_reviews(id) on delete cascade,
  session_id text not null unique references public.haven_sessions(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.review_access_tokens enable row level security;
revoke all on public.review_access_tokens from public, anon, authenticated;
grant all on public.review_access_tokens to service_role;

-- All review/session mutations now go through verified edge functions.
-- Revoke privileges as well as the known policies so unknown legacy policies cannot bypass this.
revoke insert, update, delete on public.brand_reviews, public.haven_sessions from public, anon, authenticated;
drop policy if exists anon_insert_reviews on public.brand_reviews;
drop policy if exists anon_update_reviews on public.brand_reviews;
drop policy if exists anon_insert_sessions on public.haven_sessions;
drop policy if exists anon_update_sessions on public.haven_sessions;
drop policy if exists anon_upload_screenshots on storage.objects;
revoke all on public.admin_lead_overview from public, anon, authenticated;

create or replace function public.create_haven_review(p_review jsonb, p_session_id text, p_token_hash text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_id text;
  v_proof public.review_access_tokens;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_session_id is null or coalesce((p_review->>'agreed_to_terms')::boolean, false) = false then
    raise exception 'Invalid review creation request';
  end if;
  insert into public.brand_reviews (
    id, full_name, brand_name, email, whatsapp, main_goal, platform_type, social_platform,
    social_link, website_url, screenshot_url, agreed_to_terms, agreed_at,
    utm_source, utm_campaign, referrer_url, device_type, visit_count, first_visit_at,
    days_to_convert, country, city
  ) values (
    p_review->>'id', p_review->>'full_name', p_review->>'brand_name', p_review->>'email',
    p_review->>'whatsapp', p_review->>'main_goal', p_review->>'platform_type', p_review->>'social_platform',
    p_review->>'social_link', p_review->>'website_url', p_review->>'screenshot_url', true, now(),
    p_review->>'utm_source', p_review->>'utm_campaign', p_review->>'referrer_url', p_review->>'device_type',
    coalesce((p_review->>'visit_count')::integer, 1), coalesce((p_review->>'first_visit_at')::timestamptz, now()),
    coalesce((p_review->>'days_to_convert')::integer, 0), p_review->>'country', p_review->>'city'
  ) on conflict (id) do nothing returning id into v_id;

  if v_id is null then
    select * into v_proof from public.review_access_tokens where review_id = p_review->>'id';
    if not found or v_proof.session_id <> p_session_id or v_proof.token_hash <> p_token_hash then
      raise exception 'Review access denied' using errcode = '42501';
    end if;
    perform id from public.brand_reviews where id = v_proof.review_id
      and email = p_review->>'email'
      and screenshot_url is not distinct from p_review->>'screenshot_url';
    if not found then raise exception 'Submission changed during retry' using errcode = '22023'; end if;
    return jsonb_build_object('reviewId', v_proof.review_id, 'sessionId', v_proof.session_id);
  end if;

  insert into public.haven_sessions (id, review_id, scope, messages, current_step, last_step_reached, total_exchanges)
  values (p_session_id, v_id, 'audit', '[]'::jsonb, 'AWAITING_DIAGNOSTIC_Q1', 'AWAITING_DIAGNOSTIC_Q1', 0);
  insert into public.review_access_tokens (review_id, session_id, token_hash) values (v_id, p_session_id, p_token_hash);
  return jsonb_build_object('reviewId', v_id, 'sessionId', p_session_id);
end;
$$;
revoke all on function public.create_haven_review(jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_haven_review(jsonb, text, text) to service_role;

-- One transaction prevents a successful transcript save paired with a failed review update.
create or replace function public.sync_haven_review(
  p_session_id text, p_review_id text, p_messages jsonb, p_snapshot_at timestamptz,
  p_clicked_booking boolean default false, p_clicked_playbook boolean default false
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform id from public.brand_reviews where id = p_review_id for update;
  if not found then raise exception 'Review no longer exists'; end if;
  perform id from public.haven_sessions where id = p_session_id and review_id = p_review_id and scope = 'audit' for update;
  if not found then raise exception 'Session no longer exists'; end if;
  update public.haven_sessions set
    messages = p_messages,
    total_exchanges = greatest(coalesce(total_exchanges, 0), (select count(*) from jsonb_array_elements(p_messages) m where m->>'role' = 'user')),
    updated_at = now(), last_client_sync_at = p_snapshot_at
  where id = p_session_id and (last_client_sync_at is null or last_client_sync_at < p_snapshot_at);
  update public.brand_reviews set
    clicked_booking_link = coalesce(clicked_booking_link, false) or p_clicked_booking,
    clicked_playbook_link = coalesce(clicked_playbook_link, false) or p_clicked_playbook,
    updated_at = now()
  where id = p_review_id;
end;
$$;
revoke all on function public.sync_haven_review(text, text, jsonb, timestamptz, boolean, boolean) from public, anon, authenticated;
grant execute on function public.sync_haven_review(text, text, jsonb, timestamptz, boolean, boolean) to service_role;
commit;

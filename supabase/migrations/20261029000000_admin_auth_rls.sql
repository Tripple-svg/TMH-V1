begin;
create or replace function public.is_tmh_admin()
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role','')='admin';
$$;
revoke all on function public.is_tmh_admin() from public,anon;
grant execute on function public.is_tmh_admin() to authenticated,service_role;
alter table public.brand_reviews enable row level security;
alter table public.haven_sessions enable row level security;
alter table public.playbook_purchases enable row level security;
alter table public.strategy_call_bookings enable row level security;
alter table public.team_assignments enable row level security;
-- A signed-in customer is not an admin. Never use USING(true) for private data.
create policy "TMH admin read reviews" on public.brand_reviews for select to authenticated using(public.is_tmh_admin());
create policy "TMH admin read conversations" on public.haven_sessions for select to authenticated using(public.is_tmh_admin());
create policy "TMH admin read purchases" on public.playbook_purchases for select to authenticated using(public.is_tmh_admin());
create policy "TMH admin read bookings" on public.strategy_call_bookings for select to authenticated using(public.is_tmh_admin());
create policy "TMH admin read assignments" on public.team_assignments for select to authenticated using(public.is_tmh_admin());
grant select on public.brand_reviews,public.haven_sessions,public.playbook_purchases,public.strategy_call_bookings to authenticated;
-- Keep the frozen notification payload and its bearer link server-only.
grant select(id,booking_id,inquiry_id,assignee_name,assignee_email,preparation_note,revision,expires_at,revoked_at,acknowledged_at,email_attempted_at,email_sent_at,email_last_error,created_at,updated_at)
  on public.team_assignments to authenticated;
commit;

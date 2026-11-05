-- Record the production incident fix. Keep current admin access and private data.
begin;
drop policy if exists "anon_select_sessions" on public.haven_sessions;
alter table public.haven_sessions enable row level security;
commit;

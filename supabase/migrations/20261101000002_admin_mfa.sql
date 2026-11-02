begin;
-- Opt-in MFA: a newly verified Auth factor immediately protects old AAL1
-- sessions as well. Non-enrolled staff retain their existing access. Read Auth
-- under the trusted migration owner; no factor metadata is exposed to clients.
create or replace function public.is_tmh_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from auth.users u where u.id=auth.uid()
    and u.raw_app_meta_data->>'role'='admin' and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=now())
    and (coalesce(auth.jwt()->>'aal','aal1')='aal2'
      or not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified')));
$$;
revoke all on function public.is_tmh_admin() from public,anon;
grant execute on function public.is_tmh_admin() to authenticated,service_role;

-- Edge functions use a service credential to read private rows. Check the
-- current Auth row and factors for those reads too; public getUser responses
-- are not relied on to expose internal ban/deletion or factor fields.
create or replace function public.admin_access_allowed(p_actor uuid,p_aal text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.role()='service_role' and exists(select 1 from auth.users u where u.id=p_actor
    and u.raw_app_meta_data->>'role'='admin' and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=now())
    and (p_aal='aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified')));
$$;
revoke all on function public.admin_access_allowed(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_access_allowed(uuid,text) to service_role;
commit;

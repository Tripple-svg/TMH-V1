begin;
-- The earlier recovery migration owns the private, RLS-protected limit table.
-- These functions share one password-guess budget across every admin endpoint.
create function public.begin_admin_auth(p_bucket text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare item public.playbook_security_limits;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_bucket is null or p_bucket not like 'admin-auth:%' or length(p_bucket)>160 then raise exception 'Invalid bucket'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_bucket,0));
  select * into item from public.playbook_security_limits where bucket=p_bucket for update;
  if item.bucket is null then
    insert into public.playbook_security_limits(bucket,requests) values(p_bucket,0) returning * into item;
  elsif item.started_at<=now()-interval '10 minutes' then
    update public.playbook_security_limits set started_at=now(),requests=0 where bucket=p_bucket returning * into item;
  end if;
  if item.requests>=5 then return jsonb_build_object('allowed',false); end if;
  update public.playbook_security_limits set requests=requests+1 where bucket=p_bucket;
  return jsonb_build_object('allowed',true,'started_at',item.started_at);
end; $$;
create function public.finish_admin_auth(p_bucket text,p_started_at timestamptz)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.playbook_security_limits set requests=greatest(0,requests-1) where bucket=p_bucket and started_at=p_started_at;
  return found;
end; $$;
revoke all on function public.begin_admin_auth(text),public.finish_admin_auth(text,timestamptz) from public,anon,authenticated;
grant execute on function public.begin_admin_auth(text),public.finish_admin_auth(text,timestamptz) to service_role;
commit;

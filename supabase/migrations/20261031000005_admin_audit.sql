begin;

-- JWT role claims remain valid until token expiry. Consult Auth's current row
-- for every RLS statement, so demotion, deletion and bans apply immediately.
-- The owner must remain the trusted migration role; callers cannot read Auth.
create or replace function public.is_tmh_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from auth.users u where u.id=auth.uid()
    and u.raw_app_meta_data->>'role'='admin' and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=now()));
$$;
revoke all on function public.is_tmh_admin() from public,anon;
grant execute on function public.is_tmh_admin() to authenticated,service_role;

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid not null,
  action text not null,
  record_type text not null,
  record_id text not null check(length(record_id) between 1 and 200),
  network_hash text not null check(network_hash ~ '^[a-f0-9]{64}$'),
  changed_fields text[] not null default '{}',
  outcome text not null check(outcome in ('applied','not_applied','requested'))
);
create index admin_audit_recent on public.admin_audit_events(occurred_at desc,id desc);
create index admin_audit_record on public.admin_audit_events(record_type,record_id,occurred_at desc);
alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from public,anon,authenticated,service_role;
grant select on public.admin_audit_events to service_role;
-- No cascading FK: deleting a lead or Auth account must retain accountability.
-- No email, notes, reasons, request payload, token or raw IP is copied here.
create function public.reject_admin_audit_change() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'Admin audit events are append-only' using errcode='42501'; end; $$;
create trigger admin_audit_no_change before update or delete on public.admin_audit_events
for each row execute function public.reject_admin_audit_change();
create trigger admin_audit_no_truncate before truncate on public.admin_audit_events
for each statement execute function public.reject_admin_audit_change();
revoke all on function public.reject_admin_audit_change() from public,anon,authenticated,service_role;

-- Narrow server API, with no arbitrary SQL, table name, actor override in the
-- payload, or audit payload. A compromised service credential is still a full
-- infrastructure credential; browser credentials cannot execute this function.
create function public.run_admin_mutation(p_actor uuid,p_network_hash text,p_action text,p_record_id text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; item public.team_assignments; review public.brand_reviews;
  changed integer:=0; fields text[]:='{}'; allowed text[]; kind text; outcome text:='applied'; audit_action text:=p_action;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  -- Lock the current Auth row for this transaction. A demotion/deletion racing
  -- with a mutation is serialized, rather than relying on an earlier Edge check.
  perform 1 from auth.users u where u.id=p_actor and u.raw_app_meta_data->>'role'='admin'
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) for share;
  if not found then raise exception 'Current admin required' using errcode='42501'; end if;
  if p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$'
    or p_record_id is null or length(p_record_id) not between 1 and 200
    or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid audit context' using errcode='22023'; end if;

  case p_action
    when 'review_update' then kind:='review'; allowed:=array['followup_status','followup_notes','converted_to_call','converted_to_purchase','deal_value','call_booked_at'];
    when 'review_delete','review_email_retry' then kind:='review'; allowed:='{}';
    when 'review_email_error' then kind:='review'; allowed:=array['code'];
    when 'verification_unlock' then kind:='visitor'; allowed:='{}';
    when 'inquiry_update' then kind:='inquiry'; allowed:=array['revision','status','owner','notes','followup'];
    when 'assignment_save' then kind:='team_assignment'; allowed:=array['kind','revision','name','email','note'];
    when 'assignment_revoke' then kind:='team_assignment'; allowed:=array['revision'];
    when 'assignment_email_claim' then kind:='team_assignment'; allowed:=array['revision','payload'];
    when 'assignment_email_result' then kind:='team_assignment'; allowed:=array['revision','provider_id','error'];
    when 'moderation_update' then kind:='moderation'; allowed:=array['email','visitor_id','status','reason','session_id'];
    when 'moderation_retry' then kind:='moderation'; allowed:='{}'; outcome:='requested';
    when 'purchase_email_retry' then kind:='purchase'; allowed:='{}'; outcome:='requested';
    when 'purchase_email_error' then kind:='purchase'; allowed:=array['code'];
    when 'support_update' then kind:='support'; allowed:=array['revision','status','notes','action','reason'];
    when 'ai_settings_update' then kind:='ai_settings'; allowed:=array['chat_enabled','scoring_enabled','visitor_daily_calls','visitor_daily_tokens','review_daily_calls','review_daily_tokens','network_daily_calls','network_daily_tokens','global_daily_calls','global_daily_tokens'];
    else raise exception 'Unknown admin action' using errcode='22023';
  end case;
  if exists(select 1 from jsonb_object_keys(p_payload) k where not(k=any(allowed))) then raise exception 'Unexpected mutation field' using errcode='22023'; end if;
  select coalesce(array_agg(k order by k),'{}') into fields from jsonb_object_keys(p_payload) k;

  case p_action
    when 'review_update' then
      if p_payload ? 'followup_status' and p_payload->>'followup_status' not in ('pending','contacted','booked','closed','lost')
        or length(coalesce(p_payload->>'followup_notes',''))>4000 then raise exception 'Invalid review fields' using errcode='22023'; end if;
      update public.brand_reviews set
        followup_status=case when p_payload?'followup_status' then p_payload->>'followup_status' else followup_status end,
        followup_notes=case when p_payload?'followup_notes' then p_payload->>'followup_notes' else followup_notes end,
        converted_to_call=case when p_payload?'converted_to_call' then (p_payload->>'converted_to_call')::boolean else converted_to_call end,
        converted_to_purchase=case when p_payload?'converted_to_purchase' then (p_payload->>'converted_to_purchase')::boolean else converted_to_purchase end,
        deal_value=case when p_payload?'deal_value' then (p_payload->>'deal_value')::numeric else deal_value end,
        call_booked_at=case when p_payload?'call_booked_at' then (p_payload->>'call_booked_at')::timestamptz else call_booked_at end,updated_at=now()
      where id=p_record_id returning * into review;
      if found then result:=jsonb_build_object('id',review.id,'followup_status',review.followup_status,'followup_notes',review.followup_notes,'updated_at',review.updated_at); end if;
    when 'review_delete' then result:=public.admin_delete_lead(p_record_id);
    when 'verification_unlock' then
      update public.verification_attempts set attempts=0,cooldown_until=null,locked_at=null,updated_at=now() where visitor_id=p_record_id;
      get diagnostics changed=row_count; result:=jsonb_build_object('reset',changed);
    when 'inquiry_update' then result:=public.update_haven_inquiry(p_record_id,(p_payload->>'revision')::integer,p_payload->>'status',p_payload->>'owner',p_payload->>'notes',(p_payload->>'followup')::date);
    when 'assignment_save' then
      result:=public.save_team_assignment(p_payload->>'kind',p_record_id,(p_payload->>'revision')::integer,p_payload->>'name',p_payload->>'email',p_payload->>'note');
      if result?'id' then p_record_id:=result->>'id'; end if;
    when 'assignment_revoke' then
      update public.team_assignments set revoked_at=now() where id=p_record_id::uuid and revision=(p_payload->>'revision')::integer returning * into item;
      if found then result:=to_jsonb(item)-array['email_payload','email_first_attempt_at','provider_email_id']; end if;
    when 'assignment_email_claim' then result:=public.claim_team_assignment_email(p_record_id::uuid,(p_payload->>'revision')::integer,p_payload->'payload');
    when 'assignment_email_result' then
      if p_payload->>'error' is not null and p_payload->>'error' !~ '^[a-z0-9_]{1,100}$' then raise exception 'Invalid diagnostic code' using errcode='22023'; end if;
      update public.team_assignments set provider_email_id=coalesce(p_payload->>'provider_id',provider_email_id),
        email_sent_at=case when p_payload->>'error' is null then now() else email_sent_at end,email_last_error=p_payload->>'error'
      where id=p_record_id::uuid and revision=(p_payload->>'revision')::integer returning * into item;
      if found then result:=to_jsonb(item)-array['email_payload','email_first_attempt_at','provider_email_id']; end if;
    when 'moderation_update' then
      result:=public.set_haven_moderation_flag(p_payload->>'email',p_payload->>'visitor_id',p_payload->>'status',p_payload->>'reason',p_payload->>'session_id');
      p_record_id:=coalesce(result->>'reviewId',result->>'visitorId',p_record_id);
      audit_action:='moderation_set_'||(p_payload->>'status');
    when 'support_update' then
      result:=public.update_support_request(p_record_id::uuid,(p_payload->>'revision')::integer,p_payload->>'status',p_payload->>'notes',p_actor,p_payload->>'action',p_payload->>'reason');
      audit_action:='support_'||(p_payload->>'action');
    when 'ai_settings_update' then
      update public.ai_budget_settings set
        chat_enabled=coalesce((p_payload->>'chat_enabled')::boolean,chat_enabled),scoring_enabled=coalesce((p_payload->>'scoring_enabled')::boolean,scoring_enabled),
        visitor_daily_calls=coalesce((p_payload->>'visitor_daily_calls')::integer,visitor_daily_calls),visitor_daily_tokens=coalesce((p_payload->>'visitor_daily_tokens')::bigint,visitor_daily_tokens),
        review_daily_calls=coalesce((p_payload->>'review_daily_calls')::integer,review_daily_calls),review_daily_tokens=coalesce((p_payload->>'review_daily_tokens')::bigint,review_daily_tokens),
        network_daily_calls=coalesce((p_payload->>'network_daily_calls')::integer,network_daily_calls),network_daily_tokens=coalesce((p_payload->>'network_daily_tokens')::bigint,network_daily_tokens),
        global_daily_calls=coalesce((p_payload->>'global_daily_calls')::integer,global_daily_calls),global_daily_tokens=coalesce((p_payload->>'global_daily_tokens')::bigint,global_daily_tokens),updated_at=now()
      where id=true returning to_jsonb(ai_budget_settings.*) into result;
    when 'review_email_error','purchase_email_error' then
      if p_payload->>'code' is null or p_payload->>'code' !~ '^[a-z0-9_]{1,100}$' then raise exception 'Invalid diagnostic code' using errcode='22023'; end if;
      if p_action='review_email_error' then update public.brand_reviews set welcome_email_last_error=p_payload->>'code' where id=p_record_id and welcome_email_sent=false;
      else update public.playbook_purchases set thankyou_last_error=p_payload->>'code' where id::text=p_record_id and thankyou_sent=false; end if;
      result:=jsonb_build_object('ok',true);
    else result:=jsonb_build_object('ok',true); outcome:='requested';
  end case;
  if result is null or result->>'conflict'='true' or result->>'busy'='true' or result->>'missing'='true'
    or result->>'cooldown'='true' or result->>'unavailable'='true' or result->>'deleted'='false'
    or result->>'already_sent'='true' or result->>'expired_retry'='true' or result->>'reset'='0' then outcome:='not_applied'; end if;
  insert into public.admin_audit_events(actor_id,action,record_type,record_id,network_hash,changed_fields,outcome)
    values(p_actor,audit_action,kind,p_record_id,p_network_hash,fields,outcome);
  return result;
end; $$;
revoke all on function public.run_admin_mutation(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.run_admin_mutation(uuid,text,text,text,jsonb) to service_role;
commit;

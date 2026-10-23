-- Apply after 20261023000003: private visitor identity and chat ownership.
BEGIN;
ALTER TABLE public.haven_chat_visitors
  ADD COLUMN flag_status TEXT NOT NULL DEFAULT 'white' CHECK (flag_status IN ('white','yellow','red')),
  ADD COLUMN flag_reason TEXT;

ALTER TABLE public.flag_alert_notifications
  ALTER COLUMN review_id DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL,
  ADD COLUMN visitor_id TEXT REFERENCES public.haven_chat_visitors(id) ON DELETE CASCADE,
  ADD COLUMN customer_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN customer_sent_at TIMESTAMPTZ,
  ADD COLUMN full_name TEXT,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown' CHECK (source IN ('lead','support','service','admin','unknown')),
  ADD COLUMN session_id TEXT,
  ADD CONSTRAINT flag_notification_has_subject CHECK (review_id IS NOT NULL OR visitor_id IS NOT NULL);
CREATE INDEX flag_customer_notifications_pending_idx ON public.flag_alert_notifications(created_at)
  WHERE customer_required AND customer_sent_at IS NULL;

-- Snapshot trustworthy identity/context at the time of the flag. The sender
-- never accepts caller-supplied names, recipients or chat labels.
CREATE FUNCTION public.snapshot_flag_notification_context()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE chat public.haven_sessions; requested_session TEXT;
BEGIN
  NEW.source := CASE WHEN NEW.review_id IS NOT NULL THEN 'lead' ELSE 'admin' END;
  IF NEW.review_id IS NOT NULL THEN
    SELECT full_name INTO NEW.full_name FROM public.brand_reviews WHERE id=NEW.review_id;
  END IF;
  requested_session := nullif(current_setting('haven.moderation_session_id',true),'');
  IF requested_session IS NOT NULL THEN
    SELECT * INTO chat FROM public.haven_sessions WHERE id=requested_session
      AND ((NEW.review_id IS NOT NULL AND review_id=NEW.review_id)
        OR (NEW.visitor_id IS NOT NULL AND visitor_id=NEW.visitor_id));
    IF FOUND THEN
      NEW.session_id := chat.id;
      NEW.source := CASE WHEN chat.scope='audit' THEN 'lead' ELSE chat.scope END;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER snapshot_flag_notification_context BEFORE INSERT ON public.flag_alert_notifications
FOR EACH ROW EXECUTE FUNCTION public.snapshot_flag_notification_context();

CREATE TABLE public.haven_moderation_events (
  event_key TEXT PRIMARY KEY CHECK (length(event_key) BETWEEN 1 AND 160),
  review_id TEXT REFERENCES public.brand_reviews(id) ON DELETE CASCADE,
  visitor_id TEXT REFERENCES public.haven_chat_visitors(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (review_id IS NOT NULL OR visitor_id IS NOT NULL)
);
ALTER TABLE public.haven_moderation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haven_moderation_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haven_moderation_events TO service_role;

CREATE OR REPLACE FUNCTION public.queue_flag_alert_notification()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.flag_status IS DISTINCT FROM NEW.flag_status THEN
    IF NEW.flag_status IN ('yellow','red') THEN
      INSERT INTO public.flag_alert_notifications (review_id,email,status,reason,customer_required)
      VALUES (NEW.id,NEW.email,NEW.flag_status,NEW.flag_reason,true);
    END IF;
    -- Deliberate administrator changes apply to every linked browser identity.
    UPDATE public.haven_chat_visitors SET flag_status=NEW.flag_status, flag_reason=NEW.flag_reason
    WHERE review_id=NEW.id AND (flag_status IS DISTINCT FROM NEW.flag_status OR flag_reason IS DISTINCT FROM NEW.flag_reason);
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.queue_visitor_flag_notification()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE linked_status TEXT;
BEGIN
  IF NEW.review_id IS NOT NULL THEN
    -- Carry a guest warning/restriction forward when verified review proof links them.
    SELECT flag_status INTO linked_status FROM public.brand_reviews WHERE id=NEW.review_id;
    IF (NEW.flag_status='red' AND linked_status<>'red')
      OR (NEW.flag_status='yellow' AND linked_status='white') THEN
      UPDATE public.brand_reviews SET flag_status=NEW.flag_status,flag_reason=NEW.flag_reason WHERE id=NEW.review_id;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.flag_status IS DISTINCT FROM NEW.flag_status AND NEW.flag_status IN ('yellow','red') THEN
    INSERT INTO public.flag_alert_notifications (visitor_id,status,reason,customer_required)
    VALUES (NEW.id,NEW.flag_status,NEW.flag_reason,false);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER queue_visitor_flag_notification AFTER UPDATE ON public.haven_chat_visitors
FOR EACH ROW EXECUTE FUNCTION public.queue_visitor_flag_notification();

CREATE FUNCTION public.apply_haven_ai_flag(p_review_id TEXT,p_visitor_id TEXT,p_event_key TEXT,p_reason TEXT,p_session_id TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  linked_id TEXT; locked_link TEXT; review_status TEXT; visitor_status TEXT; current_status TEXT;
  inserted_count INTEGER; changed BOOLEAN := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  PERFORM set_config('haven.moderation_session_id',coalesce(p_session_id,''),true);
  IF (p_review_id IS NULL AND p_visitor_id IS NULL) OR p_event_key IS NULL OR p_event_key !~ '^[A-Za-z0-9:_-]{1,160}$'
    OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Invalid moderation event' USING ERRCODE='22023';
  END IF;
  IF p_visitor_id IS NOT NULL THEN
    SELECT review_id,flag_status INTO linked_id,visitor_status FROM public.haven_chat_visitors WHERE id=p_visitor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Visitor not found' USING ERRCODE='P0002'; END IF;
    IF linked_id IS NOT NULL AND p_review_id IS NOT NULL AND linked_id<>p_review_id THEN
      RAISE EXCEPTION 'Moderation identity mismatch' USING ERRCODE='22023';
    END IF;
    p_review_id := coalesce(p_review_id,linked_id);
  END IF;
  IF p_review_id IS NOT NULL THEN
    SELECT flag_status INTO review_status FROM public.brand_reviews WHERE id=p_review_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review not found' USING ERRCODE='P0002'; END IF;
  END IF;
  IF p_visitor_id IS NOT NULL THEN
    SELECT review_id,flag_status INTO locked_link,visitor_status FROM public.haven_chat_visitors WHERE id=p_visitor_id FOR UPDATE;
    IF locked_link IS DISTINCT FROM linked_id THEN RAISE EXCEPTION 'Visitor linkage changed; retry' USING ERRCODE='40001'; END IF;
  END IF;
  current_status := CASE WHEN review_status='red' OR visitor_status='red' THEN 'red'
    WHEN review_status='yellow' OR visitor_status='yellow' THEN 'yellow' ELSE 'white' END;
  INSERT INTO public.haven_moderation_events (event_key,review_id,visitor_id,reason)
  VALUES (p_event_key,p_review_id,p_visitor_id,trim(p_reason)) ON CONFLICT (event_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  IF inserted_count>0 AND current_status='white' THEN
    IF p_review_id IS NOT NULL THEN
      UPDATE public.brand_reviews SET flag_status='yellow',flag_reason=trim(p_reason) WHERE id=p_review_id;
    ELSE
      UPDATE public.haven_chat_visitors SET flag_status='yellow',flag_reason=trim(p_reason) WHERE id=p_visitor_id;
    END IF;
    current_status := 'yellow'; changed := true;
  END IF;
  -- Repeated model flags never make a person red; only an administrator can restrict.
  RETURN jsonb_build_object('flagStatus',current_status,'changed',changed,'reviewId',p_review_id,'visitorId',p_visitor_id);
END; $$;
REVOKE ALL ON FUNCTION public.apply_haven_ai_flag(TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_haven_ai_flag(TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

CREATE FUNCTION public.set_haven_moderation_flag(p_email TEXT,p_visitor_id TEXT,p_status TEXT,p_reason TEXT,p_session_id TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_review TEXT; target_visitor TEXT; locked_link TEXT; saved_review JSONB; saved_visitor JSONB;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  PERFORM set_config('haven.moderation_session_id',coalesce(p_session_id,''),true);
  IF p_status IS NULL OR p_status NOT IN ('white','yellow','red') OR (p_email IS NULL AND p_visitor_id IS NULL)
    OR (p_email IS NOT NULL AND p_visitor_id IS NOT NULL) OR length(coalesce(p_reason,''))>2000 THEN
    RAISE EXCEPTION 'Invalid moderation target' USING ERRCODE='22023';
  END IF;
  IF p_visitor_id IS NOT NULL THEN
    SELECT id,review_id INTO target_visitor,target_review FROM public.haven_chat_visitors WHERE id=p_visitor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Visitor not found' USING ERRCODE='P0002'; END IF;
  ELSE
    SELECT id INTO target_review FROM public.brand_reviews WHERE lower(email)=lower(trim(p_email)) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review not found' USING ERRCODE='P0002'; END IF;
  END IF;
  IF target_review IS NOT NULL THEN
    PERFORM id FROM public.brand_reviews WHERE id=target_review FOR UPDATE;
  END IF;
  IF target_visitor IS NOT NULL THEN
    SELECT review_id INTO locked_link FROM public.haven_chat_visitors WHERE id=target_visitor FOR UPDATE;
    IF locked_link IS DISTINCT FROM target_review THEN RAISE EXCEPTION 'Visitor linkage changed; retry' USING ERRCODE='40001'; END IF;
  END IF;
  IF target_review IS NOT NULL THEN
    UPDATE public.brand_reviews SET flag_status=p_status,flag_reason=p_reason WHERE id=target_review;
    SELECT jsonb_build_object('id',id,'flag_status',flag_status,'flag_reason',flag_reason) INTO saved_review
      FROM public.brand_reviews WHERE id=target_review;
  ELSE
    UPDATE public.haven_chat_visitors SET flag_status=p_status,flag_reason=p_reason WHERE id=target_visitor;
  END IF;
  IF target_visitor IS NOT NULL THEN
    SELECT jsonb_build_object('id',id,'flag_status',flag_status,'flag_reason',flag_reason) INTO saved_visitor
      FROM public.haven_chat_visitors WHERE id=target_visitor;
  END IF;
  RETURN jsonb_build_object('review',saved_review,'visitor',saved_visitor,'flagStatus',p_status,'reviewId',target_review,'visitorId',target_visitor);
END; $$;
REVOKE ALL ON FUNCTION public.set_haven_moderation_flag(TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_haven_moderation_flag(TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
COMMIT;

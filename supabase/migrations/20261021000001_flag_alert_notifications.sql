-- Apply before testing or using the updated flag-user function.
-- Each actual transition to yellow/red creates one durable team notification.
CREATE TABLE public.flag_alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id TEXT NOT NULL REFERENCES public.brand_reviews(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('yellow', 'red')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX flag_alert_notifications_pending_review_idx
  ON public.flag_alert_notifications (review_id, created_at)
  WHERE sent_at IS NULL;

ALTER TABLE public.flag_alert_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.flag_alert_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.flag_alert_notifications TO service_role;
CREATE POLICY service_all_flag_alert_notifications
  ON public.flag_alert_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE FUNCTION public.queue_flag_alert_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Reason edits and repeated requests with the same status must not send new alerts.
  IF OLD.flag_status IS DISTINCT FROM NEW.flag_status
     AND NEW.flag_status IN ('yellow', 'red') THEN
    INSERT INTO public.flag_alert_notifications (review_id, email, status, reason)
    VALUES (NEW.id, NEW.email, NEW.flag_status, NEW.flag_reason);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER queue_flag_alert_notification
AFTER UPDATE ON public.brand_reviews
FOR EACH ROW EXECUTE FUNCTION public.queue_flag_alert_notification();

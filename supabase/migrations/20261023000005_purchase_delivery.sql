ALTER TABLE public.playbook_purchases
  ADD COLUMN IF NOT EXISTS thankyou_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thankyou_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thankyou_last_error TEXT,
  ADD COLUMN IF NOT EXISTS thankyou_email_id TEXT;

COMMENT ON COLUMN public.playbook_purchases.thankyou_sent_at IS 'Time Resend acceptance was confirmed and its durable marker saved; not proof of inbox delivery.';
COMMENT ON COLUMN public.playbook_purchases.thankyou_last_error IS 'Sanitized delivery failure code; excludes provider bodies, buyer content and secrets.';
COMMENT ON COLUMN public.playbook_purchases.thankyou_email_id IS 'Resend acceptance id for provider-side investigation.';

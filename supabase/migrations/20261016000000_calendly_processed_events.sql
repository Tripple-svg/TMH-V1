CREATE TABLE public.calendly_processed_events (
  id uuid primary key default gen_random_uuid(),
  event_uuid text not null unique,
  invitee_email text,
  processed_at timestamptz not null default now()
);
CREATE INDEX calendly_processed_events_uuid
  ON public.calendly_processed_events (event_uuid);
ALTER TABLE public.calendly_processed_events ENABLE ROW LEVEL SECURITY;
-- No anon policies: service role only.
REVOKE ALL ON public.calendly_processed_events FROM anon, authenticated;
GRANT ALL ON public.calendly_processed_events TO service_role;

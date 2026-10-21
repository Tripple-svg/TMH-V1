CREATE TABLE public.playbook_purchases (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reference text not null unique,
  amount numeric,
  created_at timestamptz not null default now(),
  thankyou_sent boolean not null default false
);

COMMENT ON COLUMN public.playbook_purchases.amount IS 'Paystack transaction amount in kobo (NGN minor units).';

ALTER TABLE public.playbook_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.playbook_purchases FROM anon, authenticated;
GRANT ALL ON public.playbook_purchases TO service_role;

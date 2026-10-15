create table public.booking_intents (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  service_id text check (service_id in ('web', 'growth', 'content')),
  created_at timestamptz not null default now(),
  ip_address text,
  confirmation_sent boolean default false
);
create index booking_intents_email on public.booking_intents (lower(email));
alter table public.booking_intents enable row level security;
revoke all on public.booking_intents from anon, authenticated;
grant all on public.booking_intents to service_role;

-- The review path has no booking_intent; keep its send guard on the review.
alter table public.brand_reviews
  add column if not exists booking_confirmation_sent boolean default false;

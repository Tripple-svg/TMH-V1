create table public.data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text not null unique,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'expired')),
  ip_address text,
  created_at timestamptz not null default now()
);

create index idx_data_deletion_requests_token
  on public.data_deletion_requests (token);

create index idx_data_deletion_requests_email
  on public.data_deletion_requests (email);

alter table public.data_deletion_requests enable row level security;

create policy service_all_data_deletion_requests
  on public.data_deletion_requests
  for all
  to service_role
  using (true)
  with check (true);

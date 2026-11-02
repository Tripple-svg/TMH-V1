begin;
-- Optional Zoho Mail metadata integration. This is a webhook signing secret,
-- never public configuration; keep this table out of exports and application logs.
create table public.mail_webhook_integrations (
  provider text primary key check(provider='zoho'),
  signing_secret text not null check(length(signing_secret) between 1 and 512),
  created_at timestamptz not null default now()
);
alter table public.mail_webhook_integrations enable row level security;
revoke all on public.mail_webhook_integrations from public,anon,authenticated,service_role;
-- The handler can register once and read the pinned value, but cannot rotate it.
-- A database operator may deliberately delete the row for a new enrollment.
grant select,insert,delete on public.mail_webhook_integrations to service_role;
comment on table public.mail_webhook_integrations is 'Server-only webhook signing credentials. No customer ownership or recovery authority.';
commit;

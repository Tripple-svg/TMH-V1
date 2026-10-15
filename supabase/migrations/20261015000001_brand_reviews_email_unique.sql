-- Existing duplicate emails must be resolved explicitly if this statement fails.
-- Do not delete or merge customer records automatically.
create unique index if not exists brand_reviews_email_unique
  on public.brand_reviews (lower(email));

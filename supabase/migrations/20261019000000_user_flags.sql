ALTER TABLE public.brand_reviews
  ADD COLUMN flag_status TEXT NOT NULL DEFAULT 'white'
    CHECK (flag_status IN ('white', 'yellow', 'red')),
  ADD COLUMN flag_reason TEXT;

-- Existing public review writes must not let visitors clear their restrictions.
CREATE FUNCTION public.protect_brand_review_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.flag_status <> 'white' OR NEW.flag_reason IS NOT NULL THEN
        RAISE EXCEPTION 'Only an administrator may set user flags' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.flag_status IS DISTINCT FROM OLD.flag_status
       OR NEW.flag_reason IS DISTINCT FROM OLD.flag_reason THEN
      RAISE EXCEPTION 'Only an administrator may change user flags' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_brand_review_flags
BEFORE INSERT OR UPDATE ON public.brand_reviews
FOR EACH ROW EXECUTE FUNCTION public.protect_brand_review_flags();

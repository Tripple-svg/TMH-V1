-- Run before using Delete Lead in the admin dashboard.
CREATE OR REPLACE FUNCTION public.admin_delete_lead(p_review_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  lead_screenshot TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Admin deletion requires service_role' USING ERRCODE = '42501';
  END IF;
  IF p_review_id IS NULL OR length(trim(p_review_id)) = 0 THEN
    RAISE EXCEPTION 'Missing review ID' USING ERRCODE = '22023';
  END IF;

  SELECT screenshot_url INTO lead_screenshot
  FROM public.brand_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', false);
  END IF;

  -- Both deletes roll back together if either fails. Access tokens cascade with
  -- their session/review FKs. Existing SET NULL event FKs preserve aggregate data.
  DELETE FROM public.haven_sessions WHERE review_id = p_review_id;
  DELETE FROM public.brand_reviews WHERE id = p_review_id;
  -- Purchases are independent financial records and are deliberately retained.
  RETURN jsonb_build_object('deleted', true, 'screenshot_path', lead_screenshot);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_lead(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_lead(TEXT) TO service_role;

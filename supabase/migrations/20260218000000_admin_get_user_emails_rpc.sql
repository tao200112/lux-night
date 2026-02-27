-- Admin: RPC to fetch user emails from auth.users (SECURITY DEFINER)
-- Use this when schema('auth') is not reliably available from JS client.
-- Source: auth.users.email (account registration email)
-- Security: Allow service_role (auth.uid() null) or admin; block others

CREATE OR REPLACE FUNCTION public.get_user_emails(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  RETURN QUERY
  SELECT u.id AS user_id, u.email
  FROM auth.users u
  WHERE u.id = ANY(p_user_ids);
END;
$$;

COMMENT ON FUNCTION public.get_user_emails(uuid[]) IS 'Admin-only: returns id,email from auth.users for given user ids. Uses SECURITY DEFINER to access auth schema.';

REVOKE ALL ON FUNCTION public.get_user_emails(uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.get_user_emails(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_emails(uuid[]) TO service_role;

-- Admin: RPC to fetch user emails from auth.users (SECURITY DEFINER)
-- Use this when schema('auth') is not reliably available from JS client.
-- Source: auth.users.email (account registration email)

CREATE OR REPLACE FUNCTION public.get_user_emails(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id AS user_id, u.email
  FROM auth.users u
  WHERE u.id = ANY(p_user_ids);
$$;

COMMENT ON FUNCTION public.get_user_emails(uuid[]) IS 'Admin-only: returns id,email from auth.users for given user ids. Uses SECURITY DEFINER to access auth schema.';

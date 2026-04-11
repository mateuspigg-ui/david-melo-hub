CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token text)
RETURNS SETOF public.team_invitations
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.team_invitations
  WHERE token = trim(p_token)
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

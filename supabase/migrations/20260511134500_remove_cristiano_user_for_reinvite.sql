-- Remove a specific account so it can be invited again from scratch.
DO $$
DECLARE
  v_email CONSTANT TEXT := 'cristiano@davidmelo.com.br';
BEGIN
  -- Clear invitation records for this email.
  DELETE FROM public.team_invitations ti
  WHERE lower(coalesce(ti.email, '')) = lower(v_email);

  -- Remove auth user (cascades into profiles, user_roles and module permissions).
  DELETE FROM auth.users u
  WHERE lower(u.email) = lower(v_email);
END
$$;

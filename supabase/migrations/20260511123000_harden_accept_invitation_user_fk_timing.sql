CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
  v_user_exists BOOLEAN := FALSE;
  v_attempt INTEGER := 0;
BEGIN
  SELECT *
  INTO v_invitation
  FROM public.team_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite invalido ou expirado';
  END IF;

  -- Wait briefly for auth.users replication/commit visibility.
  WHILE v_attempt < 12 LOOP
    SELECT EXISTS(
      SELECT 1
      FROM auth.users u
      WHERE u.id = p_user_id
    ) INTO v_user_exists;

    EXIT WHEN v_user_exists;

    v_attempt := v_attempt + 1;
    PERFORM pg_sleep(0.5);
  END LOOP;

  IF NOT v_user_exists THEN
    RAISE EXCEPTION 'Usuario ainda nao esta disponivel. Tente novamente em alguns segundos.';
  END IF;

  UPDATE public.team_invitations
  SET status = 'accepted',
      accepted_at = now()
  WHERE id = v_invitation.id;

  INSERT INTO public.module_permissions (user_id, module)
  SELECT p_user_id, unnest(v_invitation.modules)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'team_member'::public.app_role)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
  v_user_record RECORD;
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

  -- Wait briefly until auth.users row is visible.
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

  -- Ensure profile exists even if auth trigger is delayed/failed.
  SELECT u.id,
         COALESCE(u.raw_user_meta_data->>'full_name', ''::text) AS full_name,
         u.email
  INTO v_user_record
  FROM auth.users u
  WHERE u.id = p_user_id;

  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    v_user_record.id,
    COALESCE(v_user_record.full_name, ''),
    v_user_record.email,
    'team_member'
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
      email = COALESCE(EXCLUDED.email, public.profiles.email);

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

  UPDATE public.profiles
  SET role = 'team_member'
  WHERE id = p_user_id
    AND role IS DISTINCT FROM 'admin';
END;
$$;

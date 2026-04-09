-- Define a single admin account by email and keep other users as collaborators by default.
DO $$
DECLARE
  v_admin_email CONSTANT TEXT := 'mateuspigg@gmail.com';
BEGIN
  -- Ensure the configured admin email has the admin role.
  INSERT INTO public.user_roles (user_id, role)
  SELECT p.id, 'admin'::public.app_role
  FROM public.profiles p
  WHERE lower(p.email) = lower(v_admin_email)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
  SET role = 'admin'
  WHERE lower(email) = lower(v_admin_email);

  -- Remove admin role from other users.
  DELETE FROM public.user_roles ur
  USING public.profiles p
  WHERE ur.user_id = p.id
    AND ur.role = 'admin'
    AND lower(p.email) <> lower(v_admin_email);

  -- Ensure non-admin users keep at least a collaborator role.
  INSERT INTO public.user_roles (user_id, role)
  SELECT p.id, 'team_member'::public.app_role
  FROM public.profiles p
  WHERE lower(p.email) <> lower(v_admin_email)
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role = 'team_member'
    )
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
  SET role = 'team_member'
  WHERE lower(email) <> lower(v_admin_email)
    AND role = 'admin';
END
$$;

-- New users: only the configured email becomes admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email CONSTANT TEXT := 'mateuspigg@gmail.com';
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    CASE
      WHEN lower(NEW.email) = lower(v_admin_email) THEN 'admin'
      ELSE 'team_member'
    END
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE
      WHEN lower(NEW.email) = lower(v_admin_email) THEN 'admin'::public.app_role
      ELSE 'team_member'::public.app_role
    END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

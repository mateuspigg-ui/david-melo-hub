-- Define Palloma as admin and keep profile data aligned.
DO $$
DECLARE
  v_admin_email CONSTANT TEXT := 'pallomabatista03@gmail.com';
  v_admin_name CONSTANT TEXT := 'Palloma Pedro';
BEGIN
  UPDATE public.profiles
  SET full_name = v_admin_name,
      role = 'admin'
  WHERE lower(email) = lower(v_admin_email);

  INSERT INTO public.user_roles (user_id, role)
  SELECT p.id, 'admin'::public.app_role
  FROM public.profiles p
  WHERE lower(p.email) = lower(v_admin_email)
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles ur
  USING public.profiles p
  WHERE ur.user_id = p.id
    AND ur.role = 'team_member'::public.app_role
    AND lower(p.email) = lower(v_admin_email);
END
$$;

-- Ensure new signups for this email are always admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email CONSTANT TEXT := 'pallomabatista03@gmail.com';
  v_admin_name CONSTANT TEXT := 'Palloma Pedro';
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    CASE
      WHEN lower(NEW.email) = lower(v_admin_email) THEN v_admin_name
      ELSE COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    END,
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

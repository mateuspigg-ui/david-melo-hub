-- Idempotent bootstrap for roles, permissions, invitations, and admin mapping.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  PERFORM set_config('app.settings.admin_email', 'mateuspigg@gmail.com', false);
END
$$;

-- 1) Role enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'app_role' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'team_member');
  END IF;
END
$$;

-- 2) Profiles table (kept in sync with role)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'team_member',
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'team_member';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Profiles viewable by authenticated'
  ) THEN
    CREATE POLICY "Profiles viewable by authenticated"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);
  END IF;
END
$$;

-- 3) user_roles and role check helper
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Users can view their own roles'
  ) THEN
    CREATE POLICY "Users can view their own roles"
    ON public.user_roles
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Admins can manage roles'
  ) THEN
    CREATE POLICY "Admins can manage roles"
    ON public.user_roles
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;

-- 4) Module permissions
CREATE TABLE IF NOT EXISTS public.module_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, module)
);

ALTER TABLE public.module_permissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'module_permissions' AND policyname = 'Admins can manage module permissions'
  ) THEN
    CREATE POLICY "Admins can manage module permissions"
    ON public.module_permissions
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'module_permissions' AND policyname = 'Users can view own permissions'
  ) THEN
    CREATE POLICY "Users can view own permissions"
    ON public.module_permissions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;
END
$$;

-- 5) Team invitations
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  modules TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ
);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'team_invitations' AND policyname = 'Admins can manage invitations'
  ) THEN
    CREATE POLICY "Admins can manage invitations"
    ON public.team_invitations
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'team_invitations' AND policyname = 'Anyone can view invitation by token'
  ) THEN
    CREATE POLICY "Anyone can view invitation by token"
    ON public.team_invitations
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;
END
$$;

-- 6) Invitation accept flow
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
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

-- 7) New user trigger: only configured email gets admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email TEXT := current_setting('app.settings.admin_email', true);
BEGIN
  IF v_admin_email IS NULL OR v_admin_email = '' THEN
    v_admin_email := 'mateuspigg@gmail.com';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    CASE
      WHEN lower(NEW.email) = lower(v_admin_email) THEN 'admin'
      ELSE 'team_member'
    END
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
  END IF;
END
$$;

-- 8) Backfill existing users and enforce single admin email
DO $$
DECLARE
  v_admin_email TEXT := current_setting('app.settings.admin_email', true);
BEGIN
  IF v_admin_email IS NULL OR v_admin_email = '' THEN
    v_admin_email := 'mateuspigg@gmail.com';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role)
  SELECT
    u.id,
    COALESCE(u.raw_user_meta_data->>'full_name', ''),
    COALESCE(u.email, ''),
    CASE
      WHEN lower(COALESCE(u.email, '')) = lower(v_admin_email) THEN 'admin'
      ELSE 'team_member'
    END
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL;

  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, 'admin'::public.app_role
  FROM auth.users u
  WHERE lower(COALESCE(u.email, '')) = lower(v_admin_email)
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles ur
  USING auth.users u
  WHERE ur.user_id = u.id
    AND ur.role = 'admin'
    AND lower(COALESCE(u.email, '')) <> lower(v_admin_email);

  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, 'team_member'::public.app_role
  FROM auth.users u
  WHERE lower(COALESCE(u.email, '')) <> lower(v_admin_email)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles p
  SET role = CASE
    WHEN lower(COALESCE(p.email, '')) = lower(v_admin_email) THEN 'admin'
    ELSE 'team_member'
  END;
END
$$;

-- 9) Privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_invitations TO authenticated;
GRANT SELECT ON public.team_invitations TO anon;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT, UUID) TO authenticated, anon;

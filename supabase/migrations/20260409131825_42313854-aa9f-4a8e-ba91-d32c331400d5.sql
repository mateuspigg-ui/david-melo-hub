
-- Tabela de convites
CREATE TABLE public.team_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    invited_by UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    modules TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    accepted_at TIMESTAMPTZ
);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invitations"
ON public.team_invitations FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view invitation by token"
ON public.team_invitations FOR SELECT
TO anon, authenticated
USING (true);

-- Tabela de permissões de módulos por usuário
CREATE TABLE public.module_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    module TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, module)
);

ALTER TABLE public.module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage module permissions"
ON public.module_permissions FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own permissions"
ON public.module_permissions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Função para aceitar convite e criar permissões
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitation RECORD;
BEGIN
    SELECT * INTO v_invitation FROM public.team_invitations
    WHERE token = p_token AND status = 'pending' AND expires_at > now();
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Convite inválido ou expirado';
    END IF;

    -- Atualizar convite
    UPDATE public.team_invitations SET status = 'accepted', accepted_at = now() WHERE id = v_invitation.id;

    -- Criar permissões de módulos
    INSERT INTO public.module_permissions (user_id, module)
    SELECT p_user_id, unnest(v_invitation.modules)
    ON CONFLICT DO NOTHING;

    -- Atribuir role team_member
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, 'team_member')
    ON CONFLICT DO NOTHING;
END;
$$;

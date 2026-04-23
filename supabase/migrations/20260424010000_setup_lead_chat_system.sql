-- 1. ADICIONAR COLUNA DE TOKEN NOS LEADS
-- Esta parte garante que cada lead tenha um link exclusivo
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='chat_token') THEN
        ALTER TABLE public.leads ADD COLUMN chat_token UUID DEFAULT gen_random_uuid();
    END IF;
END $$;

UPDATE public.leads SET chat_token = gen_random_uuid() WHERE chat_token IS NULL;
ALTER TABLE public.leads ALTER COLUMN chat_token SET NOT NULL;

-- 2. CRIAR TABELA DE MENSAGENS
CREATE TABLE IF NOT EXISTS public.lead_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES auth.users(id),
    sender_name TEXT NOT NULL,
    content TEXT,
    attachment_url TEXT,
    attachment_type TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. HABILITAR REALTIME (SE AINDA NÃO ESTIVER)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'lead_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_messages;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Publicação realtime pode precisar de ajuste manual no dashboard.';
END $$;

-- 4. FUNÇÃO PARA BUSCAR LEAD VIA TOKEN (CLIENTE)
CREATE OR REPLACE FUNCTION public.get_lead_by_token(p_token UUID)
RETURNS TABLE (
    id UUID,
    title TEXT,
    first_name TEXT,
    last_name TEXT,
    stage TEXT
) SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT l.id, l.title, l.first_name, l.last_name, l.stage
    FROM public.leads l
    WHERE l.chat_token = p_token;
END;
$$ LANGUAGE plpgsql;

-- 5. FUNÇÃO PARA BUSCAR MENSAGENS VIA TOKEN (CLIENTE)
CREATE OR REPLACE FUNCTION public.get_messages_by_token(p_token UUID)
RETURNS TABLE (
    id UUID,
    sender_name TEXT,
    content TEXT,
    attachment_url TEXT,
    attachment_type TEXT,
    created_at TIMESTAMPTZ,
    is_from_me BOOLEAN
) SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id, 
        m.sender_name, 
        m.content, 
        m.attachment_url, 
        m.attachment_type, 
        m.created_at,
        (m.sender_id IS NULL) as is_from_me
    FROM public.lead_messages m
    JOIN public.leads l ON m.lead_id = l.id
    WHERE l.chat_token = p_token
    ORDER BY m.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- 6. FUNÇÃO PARA ENVIAR MENSAGEM VIA TOKEN (CLIENTE)
CREATE OR REPLACE FUNCTION public.send_client_message(p_token UUID, p_content TEXT, p_attachment_url TEXT DEFAULT NULL, p_attachment_type TEXT DEFAULT NULL)
RETURNS VOID SECURITY DEFINER AS $$
DECLARE
    v_lead_id UUID;
    v_sender_name TEXT;
BEGIN
    SELECT l.id, COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')
    INTO v_lead_id, v_sender_name
    FROM public.leads l
    WHERE l.chat_token = p_token;

    IF v_lead_id IS NULL THEN
        RAISE EXCEPTION 'Token inválido';
    END IF;

    INSERT INTO public.lead_messages (lead_id, sender_id, sender_name, content, attachment_url, attachment_type)
    VALUES (v_lead_id, NULL, v_sender_name, p_content, p_attachment_url, p_attachment_type);
END;
$$ LANGUAGE plpgsql;

-- 7. FUNÇÃO RPC get_or_create_lead_chat (FIX PARA O ERRO DO FRONTEND)
-- Esta função é chamada via supabase.rpc('get_or_create_lead_chat')
CREATE OR REPLACE FUNCTION public.get_or_create_lead_chat(p_lead_id UUID)
RETURNS UUID SECURITY DEFINER AS $$
BEGIN
    -- Retornamos o ID do lead para confirmar que o chat (baseado no lead) está pronto
    RETURN p_lead_id;
END;
$$ LANGUAGE plpgsql;

-- 8. SEGURANÇA (RLS)
ALTER TABLE public.lead_messages ENABLE ROW LEVEL SECURITY;

-- Usuários da equipe David Melo
CREATE POLICY "Equipe acesso total mensagens" ON public.lead_messages
    FOR ALL USING (auth.role() = 'authenticated');


-- ============== TABELAS ==============
CREATE TABLE public.lead_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'open',
  unread_company integer NOT NULL DEFAULT 0,
  unread_client integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id)
);

CREATE INDEX idx_lead_chats_token ON public.lead_chats(token);
CREATE INDEX idx_lead_chats_lead ON public.lead_chats(lead_id);

CREATE TABLE public.lead_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.lead_chats(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('client','company')),
  sender_user_id uuid,
  body text,
  attachment_url text,
  attachment_name text,
  attachment_type text,
  attachment_size integer,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_chat ON public.lead_chat_messages(chat_id, created_at);

-- ============== TRIGGERS ==============
CREATE OR REPLACE FUNCTION public.touch_lead_chat_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  preview text;
BEGIN
  preview := COALESCE(NULLIF(NEW.body, ''), NEW.attachment_name, 'Anexo');
  IF NEW.sender_type = 'client' THEN
    UPDATE public.lead_chats
       SET last_message_at = NEW.created_at,
           last_message_preview = LEFT(preview, 200),
           unread_company = unread_company + 1,
           updated_at = now()
     WHERE id = NEW.chat_id;
  ELSE
    UPDATE public.lead_chats
       SET last_message_at = NEW.created_at,
           last_message_preview = LEFT(preview, 200),
           unread_client = unread_client + 1,
           updated_at = now()
     WHERE id = NEW.chat_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_lead_chat
AFTER INSERT ON public.lead_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_lead_chat_on_message();

-- ============== RLS ==============
ALTER TABLE public.lead_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_chat_messages ENABLE ROW LEVEL SECURITY;

-- Equipe autenticada pode tudo
CREATE POLICY "Authenticated manage chats"
ON public.lead_chats FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated manage chat messages"
ON public.lead_chat_messages FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- ============== FUNÇÕES PÚBLICAS (cliente acessa só com token) ==============

-- Obter ou criar chat de um lead (chamado pela equipe)
CREATE OR REPLACE FUNCTION public.get_or_create_lead_chat(p_lead_id uuid)
RETURNS public.lead_chats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chat public.lead_chats;
BEGIN
  SELECT * INTO v_chat FROM public.lead_chats WHERE lead_id = p_lead_id;
  IF NOT FOUND THEN
    INSERT INTO public.lead_chats(lead_id) VALUES (p_lead_id) RETURNING * INTO v_chat;
  END IF;
  RETURN v_chat;
END;
$$;

-- Cliente busca dados do chat usando o token
CREATE OR REPLACE FUNCTION public.get_public_chat(p_token text)
RETURNS TABLE (
  chat_id uuid,
  lead_id uuid,
  lead_title text,
  client_first_name text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.lead_id, l.title,
         COALESCE(SPLIT_PART(l.title, ' ', 1), 'Cliente'),
         c.status, c.created_at
    FROM public.lead_chats c
    JOIN public.leads l ON l.id = c.lead_id
   WHERE c.token = p_token
   LIMIT 1;
$$;

-- Cliente lista mensagens
CREATE OR REPLACE FUNCTION public.list_public_chat_messages(p_token text)
RETURNS SETOF public.lead_chat_messages
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.* FROM public.lead_chat_messages m
   JOIN public.lead_chats c ON c.id = m.chat_id
  WHERE c.token = p_token
  ORDER BY m.created_at ASC;
$$;

-- Cliente envia mensagem
CREATE OR REPLACE FUNCTION public.send_public_chat_message(
  p_token text,
  p_body text,
  p_attachment_url text DEFAULT NULL,
  p_attachment_name text DEFAULT NULL,
  p_attachment_type text DEFAULT NULL,
  p_attachment_size integer DEFAULT NULL
)
RETURNS public.lead_chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chat_id uuid;
  v_msg public.lead_chat_messages;
BEGIN
  SELECT id INTO v_chat_id FROM public.lead_chats WHERE token = p_token;
  IF v_chat_id IS NULL THEN
    RAISE EXCEPTION 'Chat não encontrado';
  END IF;

  IF (p_body IS NULL OR LENGTH(TRIM(p_body)) = 0) AND p_attachment_url IS NULL THEN
    RAISE EXCEPTION 'Mensagem vazia';
  END IF;

  INSERT INTO public.lead_chat_messages(
    chat_id, sender_type, body, attachment_url, attachment_name, attachment_type, attachment_size
  ) VALUES (
    v_chat_id, 'client',
    NULLIF(TRIM(COALESCE(p_body, '')), ''),
    p_attachment_url, p_attachment_name, p_attachment_type, p_attachment_size
  ) RETURNING * INTO v_msg;

  RETURN v_msg;
END;
$$;

-- Cliente marca mensagens da empresa como lidas
CREATE OR REPLACE FUNCTION public.mark_public_chat_read(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.lead_chat_messages m
     SET read_at = now()
    FROM public.lead_chats c
   WHERE m.chat_id = c.id
     AND c.token = p_token
     AND m.sender_type = 'company'
     AND m.read_at IS NULL;

  UPDATE public.lead_chats SET unread_client = 0, updated_at = now()
   WHERE token = p_token;
END;
$$;

-- Equipe marca mensagens do cliente como lidas
CREATE OR REPLACE FUNCTION public.mark_company_chat_read(p_chat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.lead_chat_messages
     SET read_at = now()
   WHERE chat_id = p_chat_id
     AND sender_type = 'client'
     AND read_at IS NULL;

  UPDATE public.lead_chats SET unread_company = 0, updated_at = now()
   WHERE id = p_chat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_chat(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_chat_messages(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_public_chat_message(text, text, text, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_public_chat_read(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_lead_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_company_chat_read(uuid) TO authenticated;

-- ============== STORAGE BUCKET ==============
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lead-chat-attachments', 'lead-chat-attachments', true, 26214400)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 26214400;

CREATE POLICY "Public read chat attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'lead-chat-attachments');

CREATE POLICY "Anyone can upload chat attachments"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'lead-chat-attachments');

CREATE POLICY "Authenticated can delete chat attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'lead-chat-attachments');

-- ============== REALTIME ==============
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_chats;

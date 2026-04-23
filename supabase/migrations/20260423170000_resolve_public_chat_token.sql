CREATE OR REPLACE FUNCTION public.resolve_public_chat_token(p_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chat_token text;
  v_lead_id uuid;
BEGIN
  SELECT c.token
    INTO v_chat_token
    FROM public.lead_chats c
   WHERE c.token = p_token
   LIMIT 1;

  IF v_chat_token IS NOT NULL THEN
    RETURN v_chat_token;
  END IF;

  BEGIN
    SELECT l.id
      INTO v_lead_id
      FROM public.leads l
     WHERE l.chat_token = p_token::uuid
     LIMIT 1;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_lead_id := NULL;
  END;

  IF v_lead_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.token
    INTO v_chat_token
    FROM public.lead_chats c
   WHERE c.lead_id = v_lead_id
   LIMIT 1;

  IF v_chat_token IS NULL THEN
    INSERT INTO public.lead_chats (lead_id)
    VALUES (v_lead_id)
    RETURNING token INTO v_chat_token;
  END IF;

  RETURN v_chat_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_public_chat_token(text) TO anon, authenticated;

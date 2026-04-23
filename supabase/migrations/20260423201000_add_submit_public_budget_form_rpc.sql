CREATE OR REPLACE FUNCTION public.submit_public_budget_form(
  p_title text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_event_type text,
  p_event_location text,
  p_event_date date,
  p_event_time time without time zone,
  p_guest_count integer,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  lead_id uuid,
  chat_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead_id uuid;
  v_chat_token text;
BEGIN
  INSERT INTO public.leads (
    title,
    first_name,
    last_name,
    phone,
    event_type,
    event_location,
    event_date,
    event_time,
    guest_count,
    notes,
    total_budget,
    stage
  ) VALUES (
    p_title,
    p_first_name,
    p_last_name,
    p_phone,
    p_event_type,
    p_event_location,
    p_event_date,
    p_event_time,
    p_guest_count,
    NULLIF(TRIM(COALESCE(p_notes, '')), ''),
    NULL,
    'novo_contato'
  ) RETURNING id INTO v_lead_id;

  IF to_regclass('public.lead_chats') IS NOT NULL THEN
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
  ELSE
    SELECT l.chat_token::text
      INTO v_chat_token
      FROM public.leads l
     WHERE l.id = v_lead_id;
  END IF;

  RETURN QUERY SELECT v_lead_id, v_chat_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_budget_form(text, text, text, text, text, text, date, time without time zone, integer, text) TO anon, authenticated;

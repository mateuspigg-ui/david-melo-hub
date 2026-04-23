CREATE OR REPLACE FUNCTION public.get_public_chat(p_token text)
RETURNS TABLE (
  chat_id uuid,
  lead_id uuid,
  lead_title text,
  client_first_name text,
  status text,
  created_at timestamptz,
  event_type text,
  event_date date,
  event_time time without time zone,
  event_location text,
  guest_count integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id,
         c.lead_id,
         l.title,
         COALESCE(l.first_name, SPLIT_PART(l.title, ' ', 1), 'Cliente'),
         c.status,
         c.created_at,
         l.event_type,
         l.event_date,
         l.event_time,
         l.event_location,
         l.guest_count
    FROM public.lead_chats c
    JOIN public.leads l ON l.id = c.lead_id
   WHERE c.token = p_token
   LIMIT 1;
$$;

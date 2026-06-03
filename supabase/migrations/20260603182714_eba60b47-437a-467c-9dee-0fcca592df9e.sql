
-- 1) Helper: has_module_access
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.module_permissions
      WHERE user_id = _user_id AND module = _module
    )
$$;

REVOKE ALL ON FUNCTION public.has_module_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_module_access(uuid, text) TO authenticated, service_role;

-- 2) Scope lead_chats & lead_chat_messages to CRM-enabled users
DROP POLICY IF EXISTS "Authenticated manage chats" ON public.lead_chats;
DROP POLICY IF EXISTS "Authenticated manage chat messages" ON public.lead_chat_messages;

CREATE POLICY "CRM members can read chats"
  ON public.lead_chats FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(), 'crm'));

CREATE POLICY "CRM members can insert chats"
  ON public.lead_chats FOR INSERT TO authenticated
  WITH CHECK (public.has_module_access(auth.uid(), 'crm'));

CREATE POLICY "CRM members can update chats"
  ON public.lead_chats FOR UPDATE TO authenticated
  USING (public.has_module_access(auth.uid(), 'crm'))
  WITH CHECK (public.has_module_access(auth.uid(), 'crm'));

CREATE POLICY "Admins can delete chats"
  ON public.lead_chats FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "CRM members can read chat messages"
  ON public.lead_chat_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lead_chats c
      WHERE c.id = lead_chat_messages.chat_id
        AND public.has_module_access(auth.uid(), 'crm')
    )
  );

CREATE POLICY "CRM members can insert chat messages"
  ON public.lead_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lead_chats c
      WHERE c.id = lead_chat_messages.chat_id
        AND public.has_module_access(auth.uid(), 'crm')
    )
  );

CREATE POLICY "CRM members can update chat messages"
  ON public.lead_chat_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lead_chats c
      WHERE c.id = lead_chat_messages.chat_id
        AND public.has_module_access(auth.uid(), 'crm')
    )
  );

CREATE POLICY "Admins can delete chat messages"
  ON public.lead_chat_messages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Lock down SECURITY DEFINER functions: only callers that need them keep EXECUTE
-- Internal/trigger-only or admin-only helpers
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_lead_chat_on_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Company-only chat helpers: revoke from anon, keep authenticated
REVOKE ALL ON FUNCTION public.get_or_create_lead_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_lead_chat(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_company_chat_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_company_chat_read(uuid) TO authenticated, service_role;

-- Acceptance of an invitation requires a signed-in user
REVOKE ALL ON FUNCTION public.accept_invitation(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid) TO authenticated, service_role;

-- Public-facing functions (token-gated) keep anon EXECUTE
GRANT EXECUTE ON FUNCTION public.get_public_chat(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_chat_messages(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_public_chat_read(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_public_chat_message(text, text, text, text, text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon, authenticated, service_role;

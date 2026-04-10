
-- =====================================================
-- 1. FIX: team_invitations public token exposure
-- Replace the overly permissive anonymous SELECT with a security definer function
-- =====================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public.team_invitations;

-- Create a security definer function to look up invitation by token
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token text)
RETURNS SETOF public.team_invitations
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.team_invitations
  WHERE token = p_token AND status = 'pending' AND expires_at > now()
  LIMIT 1;
$$;

-- =====================================================
-- 2. FIX: Financial tables - restrict to admin/manager only
-- =====================================================

-- payments
DROP POLICY IF EXISTS "Authenticated can manage payments" ON public.payments;
CREATE POLICY "Admins can manage payments" ON public.payments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- payment_installments
DROP POLICY IF EXISTS "Authenticated can manage installments" ON public.payment_installments;
CREATE POLICY "Admins can manage installments" ON public.payment_installments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- accounts_payable
DROP POLICY IF EXISTS "Authenticated can manage accounts_payable" ON public.accounts_payable;
CREATE POLICY "Admins can manage accounts_payable" ON public.accounts_payable
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- bank_reconciliation
DROP POLICY IF EXISTS "Authenticated can manage reconciliation" ON public.bank_reconciliation;
CREATE POLICY "Admins can manage reconciliation" ON public.bank_reconciliation
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- suppliers
DROP POLICY IF EXISTS "Authenticated can manage suppliers" ON public.suppliers;
CREATE POLICY "Admins can manage suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- 3. FIX: Storage buckets - add DELETE/UPDATE policies for admins
-- =====================================================

CREATE POLICY "Admins can delete contracts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contracts' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update contracts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contracts' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND has_role(auth.uid(), 'admin'::app_role));

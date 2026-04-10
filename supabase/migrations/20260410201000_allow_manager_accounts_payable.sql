DROP POLICY IF EXISTS "Admins can manage accounts_payable" ON public.accounts_payable;
DROP POLICY IF EXISTS "Authenticated can manage accounts_payable" ON public.accounts_payable;

CREATE POLICY "Admins and managers can manage accounts_payable"
  ON public.accounts_payable
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

NOTIFY pgrst, 'reload schema';

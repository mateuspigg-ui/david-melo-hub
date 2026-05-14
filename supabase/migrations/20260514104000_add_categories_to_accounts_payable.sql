CREATE TABLE IF NOT EXISTS public.accounts_payable_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts_payable_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'accounts_payable_categories'
      AND policyname = 'Authenticated can manage accounts_payable_categories'
  ) THEN
    CREATE POLICY "Authenticated can manage accounts_payable_categories"
      ON public.accounts_payable_categories
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounts_payable_categories TO authenticated;

ALTER TABLE public.accounts_payable
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.accounts_payable_categories(id);

CREATE INDEX IF NOT EXISTS idx_accounts_payable_category_id ON public.accounts_payable(category_id);

NOTIFY pgrst, 'reload schema';

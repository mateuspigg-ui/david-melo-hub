DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'leads'
      AND policyname = 'Anon can insert budget leads'
  ) THEN
    CREATE POLICY "Anon can insert budget leads"
      ON public.leads
      FOR INSERT
      TO anon
      WITH CHECK (stage = 'novo_contato');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.lead_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_files_lead_id ON public.lead_files(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_files_created_at ON public.lead_files(created_at DESC);

ALTER TABLE public.lead_files ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lead_files' AND policyname = 'Authenticated can manage lead files'
  ) THEN
    CREATE POLICY "Authenticated can manage lead files"
      ON public.lead_files FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

INSERT INTO storage.buckets (id, name, public)
SELECT 'lead-files', 'lead-files', true
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'lead-files'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated can upload lead files'
  ) THEN
    CREATE POLICY "Authenticated can upload lead files"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'lead-files');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated can update lead files'
  ) THEN
    CREATE POLICY "Authenticated can update lead files"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'lead-files')
      WITH CHECK (bucket_id = 'lead-files');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated can view lead files'
  ) THEN
    CREATE POLICY "Authenticated can view lead files"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'lead-files');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated can delete lead files'
  ) THEN
    CREATE POLICY "Authenticated can delete lead files"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'lead-files');
  END IF;
END
$$;

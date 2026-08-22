-- Allow anonymous (public form) inserts on lead_files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lead_files' AND policyname = 'Anonymous can insert lead files'
  ) THEN
    CREATE POLICY "Anonymous can insert lead files"
      ON public.lead_files FOR INSERT TO anon
      WITH CHECK (true);
  END IF;
END
$$;

-- Allow anonymous uploads to lead-files storage bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anonymous can upload lead files'
  ) THEN
    CREATE POLICY "Anonymous can upload lead files"
      ON storage.objects FOR INSERT TO anon
      WITH CHECK (bucket_id = 'lead-files');
  END IF;
END
$$;

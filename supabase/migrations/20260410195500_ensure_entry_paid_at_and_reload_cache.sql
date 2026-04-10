ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS entry_paid_at TIMESTAMPTZ;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payments TO authenticated;

NOTIFY pgrst, 'reload schema';

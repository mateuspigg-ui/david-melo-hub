ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS entry_paid_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
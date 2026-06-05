-- Adicionar campos expandidos na tabela suppliers

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS person_type TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS icms_contribution TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS ie TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS im TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS suframa TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address_number TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address_complement TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address_neighborhood TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address_zip TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS notes TEXT;

NOTIFY pgrst, 'reload schema';

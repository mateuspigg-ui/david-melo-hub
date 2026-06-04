-- Adicionar campos de endereco e inscricao estadual na tabela companies

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address_number TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address_complement TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address_neighborhood TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address_zip TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS ie TEXT;

NOTIFY pgrst, 'reload schema';

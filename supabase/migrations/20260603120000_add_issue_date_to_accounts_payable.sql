ALTER TABLE public.accounts_payable
ADD COLUMN IF NOT EXISTS issue_date DATE;

UPDATE public.accounts_payable
SET issue_date = due_date
WHERE issue_date IS NULL;

ALTER TABLE public.accounts_payable
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.bank_accounts(id),
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Adicionar bank_account_id em payment_installments para rastrear de qual conta foi o recebimento
ALTER TABLE public.payment_installments
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.bank_accounts(id);

-- Adicionar entry_bank_account_id em payments para rastrear de qual conta foi o sinal
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS entry_bank_account_id UUID REFERENCES public.bank_accounts(id);

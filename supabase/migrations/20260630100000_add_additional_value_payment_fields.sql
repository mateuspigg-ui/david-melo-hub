-- Adiciona colunas de baixa do aditivo de valor na tabela de pagamentos
-- Permite rastrear se o aditivo foi pago, quando, em qual conta e como

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS additional_paid_at TIMESTAMPTZ;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS additional_bank_account_id UUID REFERENCES public.bank_accounts(id);

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS additional_paid_amount NUMERIC(12,2);

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS additional_payment_method TEXT;

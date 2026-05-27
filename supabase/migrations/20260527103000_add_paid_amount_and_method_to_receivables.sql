alter table if exists public.payment_installments
  add column if not exists paid_amount numeric(12,2),
  add column if not exists payment_method text;

alter table if exists public.payments
  add column if not exists entry_paid_amount numeric(12,2),
  add column if not exists entry_payment_method text;

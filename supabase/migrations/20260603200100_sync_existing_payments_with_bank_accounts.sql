-- ============================================
-- PASO 1: Ver todos os pagamentos sem conta vinculada
-- Execute este bloco PRIMEIRO para ver os IDs
-- ============================================

-- Despesas pagas sem bank_account_id
SELECT 
  'DESPESA' as tipo,
  ap.id,
  COALESCE(s.company_name, ap.description, 'Sem descricao') as descricao,
  ap.paid_at,
  COALESCE(ap.paid_amount, ap.amount) as valor,
  ap.payment_method
FROM public.accounts_payable ap
LEFT JOIN public.suppliers s ON s.id = ap.supplier_id
WHERE ap.paid_at IS NOT NULL
  AND (ap.bank_account_id IS NULL)
ORDER BY ap.paid_at DESC;

-- Sinais pagos sem entry_bank_account_id
SELECT 
  'SINAL' as tipo,
  p.id,
  COALESCE(c.first_name || ' ' || c.last_name, 'Cliente') as descricao,
  p.entry_paid_at as paid_at,
  COALESCE(p.entry_paid_amount, p.entry_amount) as valor,
  p.entry_payment_method as payment_method
FROM public.payments p
LEFT JOIN public.clients c ON c.id = p.client_id
WHERE p.entry_paid_at IS NOT NULL
  AND (p.entry_bank_account_id IS NULL)
ORDER BY p.entry_paid_at DESC;

-- Parcelas pagas sem bank_account_id
SELECT 
  'PARCELA' as tipo,
  pi.id,
  pi.payment_id,
  COALESCE(c.first_name || ' ' || c.last_name, 'Cliente') as descricao,
  pi.paid_at,
  COALESCE(pi.paid_amount, pi.amount) as valor,
  pi.payment_method
FROM public.payment_installments pi
LEFT JOIN public.payments p ON p.id = pi.payment_id
LEFT JOIN public.clients c ON c.id = p.client_id
WHERE pi.paid_at IS NOT NULL
  AND (pi.bank_account_id IS NULL)
ORDER BY pi.paid_at DESC;

-- ============================================
-- PASO 2: Atualizar os registros
-- Substitua os IDs abaixo pelos IDs reais do PASO 1
-- ============================================
-- Contas bancarias:
-- ITAU PERSONALITE:        f08c8546-de42-4bf4-881c-32ba6156fcb9
-- BRADESCO CRISTIANO:      18840ee9-2c2f-41f1-8534-464b40911e59
-- BRADESCO DIMAZO:         0936aafd-05c3-41aa-99b5-8947acaec828
-- BRADESCO DAVID:          be337103-7a5c-402a-9d09-122ab2743712
-- BRADESCO CANDY:          6944ace2-237f-4b1b-bd42-f95a636a662e
-- CAIXA POUPANCA CRISTIANO: 69156ca9-4ab2-4df3-a988-fdf4e98428af

-- Exemplo: UPDATE public.accounts_payable SET bank_account_id = 'ID_DA_CONTA' WHERE id = 'ID_DA_DESPESA';
-- Exemplo: UPDATE public.payments SET entry_bank_account_id = 'ID_DA_CONTA' WHERE id = 'ID_DO_SINAL';
-- Exemplo: UPDATE public.payment_installments SET bank_account_id = 'ID_DA_CONTA' WHERE id = 'ID_DA_PARCELA';

-- 1. Tabelas de Cadastro de Contas Bancárias
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name TEXT NOT NULL,
    bank_code TEXT,
    agency TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_digit TEXT,
    account_type TEXT, -- corrente, poupanca, etc
    company_id UUID, -- Opcional, vincular a uma empresa
    accounting_account_id TEXT, -- Vínculo com o Razão
    description TEXT,
    status TEXT DEFAULT 'active', -- active, inactive
    default_initial_balance DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(bank_name, agency, account_number)
);

-- 2. Tabela de Conciliações Bancárias (Cabeçalho do processo)
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID REFERENCES public.bank_accounts(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status TEXT DEFAULT 'diagnostico', -- diagnostico, cruzamento, relatorio, validado, concluido
    var_tot DECIMAL(15,2) DEFAULT 0, -- Saldo extrato - saldo contábil
    ext_dif_tot DECIMAL(15,2) DEFAULT 0, -- Soma de pendências no extrato
    cont_dif_tot DECIMAL(15,2) DEFAULT 0, -- Soma de pendências na contabilidade
    dif_tot DECIMAL(15,2) DEFAULT 0, -- ext_dif_tot - cont_dif_tot
    created_by UUID, -- REFERENCES auth.users(id)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de Extrato Bancário (Transações que vêm do banco)
CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID REFERENCES public.bank_accounts(id),
    transaction_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    transaction_type TEXT, -- credito, debito
    status TEXT DEFAULT 'pendente', -- pendente, conciliado, reversao
    reconciliation_id UUID REFERENCES public.bank_reconciliations(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de Razão Contábil (Lançamentos que vêm da contabilidade)
CREATE TABLE IF NOT EXISTS public.accounting_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID REFERENCES public.bank_accounts(id),
    entry_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    document_number TEXT,
    status TEXT DEFAULT 'pendente', -- pendente, conciliado, reversao
    reconciliation_id UUID REFERENCES public.bank_reconciliations(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabela de Cruzamentos (Matches)
CREATE TABLE IF NOT EXISTS public.reconciliation_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID REFERENCES public.bank_reconciliations(id),
    bank_transaction_id UUID REFERENCES public.bank_transactions(id),
    accounting_entry_id UUID REFERENCES public.accounting_entries(id),
    match_type TEXT, -- automatico, manual
    match_score DECIMAL(5,2), -- 0 a 100 para fuzzy match
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabela de Logs e Auditoria
CREATE TABLE IF NOT EXISTS public.reconciliation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID REFERENCES public.bank_reconciliations(id),
    user_id UUID,
    step TEXT, -- diagnostico, cruzamento, relatorio, validacao_final
    action TEXT,
    result TEXT, -- sucesso, erro
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Funções e Views Inteligentes

-- View para Sumário Financeiro
CREATE OR REPLACE VIEW public.vw_financial_summary AS
SELECT 
    ba.id as bank_account_id,
    ba.bank_name,
    ba.description as account_desc,
    COALESCE(SUM(bt.amount), 0) as bank_balance,
    COALESCE(SUM(ae.amount), 0) as accounting_balance,
    (COALESCE(SUM(bt.amount), 0) - COALESCE(SUM(ae.amount), 0)) as difference
FROM public.bank_accounts ba
LEFT JOIN public.bank_transactions bt ON ba.id = bt.bank_account_id
LEFT JOIN public.accounting_entries ae ON ba.id = ae.bank_account_id
GROUP BY ba.id, ba.bank_name, ba.description;

-- Função para detectar reversões (detect reversals)
-- Ex: +100 e -100 na mesma conta/data
CREATE OR REPLACE FUNCTION public.fn_detect_reversals(p_reconciliation_id UUID) 
RETURNS void AS $$
BEGIN
    -- Lógica simplificada para marcar como reversao
    UPDATE public.bank_transactions
    SET status = 'reversao'
    WHERE reconciliation_id = p_reconciliation_id
    AND id IN (
        -- Encontrar pares com valores opostos
        SELECT t1.id 
        FROM public.bank_transactions t1
        JOIN public.bank_transactions t2 ON t1.bank_account_id = t2.bank_account_id 
            AND t1.amount = -t2.amount 
            AND t1.transaction_date = t2.transaction_date
        WHERE t1.reconciliation_id = p_reconciliation_id
    );
END;
$$ LANGUAGE plpgsql;

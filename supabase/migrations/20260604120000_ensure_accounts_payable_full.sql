-- Garantir que a tabela accounts_payable existe com TODAS as colunas necessarias
-- Essa migration e idempotente e pode ser executada multiplas vezes sem problemas

CREATE TABLE IF NOT EXISTS public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES public.suppliers(id),
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  due_date DATE NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'nao_pago',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colunas adicionadas por migrations anteriores (idempotente)
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.bank_accounts(id);
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS document_number TEXT;
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS interest NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS fine NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2);
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.accounts_payable_categories(id);
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.accounts_payable_cost_centers(id);

-- RLS
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can manage accounts_payable" ON public.accounts_payable;
DROP POLICY IF EXISTS "Admins can manage accounts_payable" ON public.accounts_payable;
DROP POLICY IF EXISTS "Admins and managers can manage accounts_payable" ON public.accounts_payable;

CREATE POLICY "Authenticated can manage accounts_payable"
  ON public.accounts_payable
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounts_payable TO authenticated;

-- Garantir tabelas auxiliares
CREATE TABLE IF NOT EXISTS public.accounts_payable_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);
ALTER TABLE public.accounts_payable_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can manage accounts_payable_categories" ON public.accounts_payable_categories;
CREATE POLICY "Authenticated can manage accounts_payable_categories"
  ON public.accounts_payable_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounts_payable_categories TO authenticated;

CREATE TABLE IF NOT EXISTS public.accounts_payable_cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);
ALTER TABLE public.accounts_payable_cost_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can manage cost_centers" ON public.accounts_payable_cost_centers;
CREATE POLICY "Authenticated can manage cost_centers"
  ON public.accounts_payable_cost_centers FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounts_payable_cost_centers TO authenticated;

-- Garantir categorias e centros de custo padrao
INSERT INTO public.accounts_payable_categories (name) VALUES ('Aluguel'), ('Fornecedores'), ('Servicos'), ('Impostos'), ('Outros')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.accounts_payable_cost_centers (name) VALUES ('Operacional'), ('Administrativo'), ('Comercial'), ('Financeiro')
ON CONFLICT (name) DO NOTHING;

-- Forcar reload do schema
NOTIFY pgrst, 'reload schema';

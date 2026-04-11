DO $$
DECLARE
  table_name TEXT;
  lead_has_first_name BOOLEAN;
  lead_has_last_name BOOLEAN;
  lead_has_phone BOOLEAN;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'reconciliation_matches',
    'reconciliation_logs',
    'bank_transactions',
    'accounting_entries',
    'bank_reconciliations',
    'bank_accounts',
    'bank_reconciliation',
    'lead_tasks',
    'payment_installments',
    'payments',
    'contracts',
    'events',
    'leads',
    'accounts_payable',
    'suppliers',
    'clients'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', table_name);
    END IF;
  END LOOP;

  CREATE TEMP TABLE tmp_clients (
    idx INT PRIMARY KEY,
    id UUID,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    email TEXT,
    instagram TEXT,
    created_at TIMESTAMPTZ
  ) ON COMMIT DROP;

  INSERT INTO tmp_clients (idx, id, first_name, last_name, phone, email, instagram, created_at)
  SELECT
    gs,
    gen_random_uuid(),
    (ARRAY['Ana','Bruno','Camila','Diego','Eduarda','Felipe','Gabriela','Henrique','Isabela','Joao','Karina','Lucas','Marina','Nicolas','Olivia','Paulo','Quezia','Rafael','Sabrina','Tiago','Ursula','Vinicius','Wanda','Yasmin','Zeca'])[gs],
    (ARRAY['Silva','Souza','Oliveira','Costa','Almeida','Melo','Ferreira','Gomes','Ribeiro','Barros','Martins','Cardoso','Rocha','Araujo','Lima','Teixeira','Nogueira','Pires','Moreira','Freitas','Batista','Rezende','Pacheco','Cunha','Nunes'])[gs],
    format('(11) 9%04s-%04s', lpad((1000 + gs)::text, 4, '0'), lpad((2000 + gs)::text, 4, '0')),
    format('cliente%02s@exemplo.com', gs),
    format('@cliente_%02s_dm', gs),
    (date_trunc('day', now()) - ((26 - gs) * interval '6 days'))
  FROM generate_series(1, 25) gs;

  INSERT INTO public.clients (id, first_name, last_name, phone, email, instagram, created_at)
  SELECT id, first_name, last_name, phone, email, instagram, created_at
  FROM tmp_clients;

  CREATE TEMP TABLE tmp_suppliers (
    idx INT PRIMARY KEY,
    id UUID,
    company_name TEXT,
    phone TEXT,
    pix_details TEXT,
    instagram TEXT,
    created_at TIMESTAMPTZ
  ) ON COMMIT DROP;

  INSERT INTO tmp_suppliers (idx, id, company_name, phone, pix_details, instagram, created_at)
  SELECT
    gs,
    gen_random_uuid(),
    format('Fornecedor Ficticio %02s', gs),
    format('(21) 98%03s-%04s', lpad((300 + gs)::text, 3, '0'), lpad((5000 + gs)::text, 4, '0')),
    format('pix-fornecedor-%02s@banco.com', gs),
    format('@fornecedor_%02s_dm', gs),
    (date_trunc('day', now()) - ((26 - gs) * interval '5 days'))
  FROM generate_series(1, 25) gs;

  INSERT INTO public.suppliers (id, company_name, phone, pix_details, instagram, created_at)
  SELECT id, company_name, phone, pix_details, instagram, created_at
  FROM tmp_suppliers;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'first_name'
  ) INTO lead_has_first_name;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'last_name'
  ) INTO lead_has_last_name;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'phone'
  ) INTO lead_has_phone;

  IF lead_has_first_name AND lead_has_last_name AND lead_has_phone THEN
    INSERT INTO public.leads (
      id, title, client_id, first_name, last_name, phone, stage, event_type, event_location,
      event_date, event_time, guest_count, total_budget, notes, assigned_to, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      format('Lead %02s - %s %s', c.idx, c.first_name, c.last_name),
      c.id,
      c.first_name,
      c.last_name,
      c.phone,
      CASE
        WHEN c.idx <= 6 THEN 'novo_contato'
        WHEN c.idx <= 11 THEN 'orcamento_enviado'
        WHEN c.idx <= 17 THEN 'em_negociacao'
        WHEN c.idx <= 22 THEN 'fechados'
        ELSE 'perdidos'
      END,
      (ARRAY['casamento', '15_anos', 'formatura', 'aniversario', 'bodas', 'corporativo'])[(c.idx % 6) + 1],
      format('Espaco Ficticio %02s - Sao Paulo', c.idx),
      (current_date + ((c.idx % 8) + 1) * interval '20 days')::date,
      make_time(14 + (c.idx % 6), 0, 0),
      80 + (c.idx * 7),
      (7000 + (c.idx * 450))::numeric,
      format('Lead ficticio %s para testes integrados do sistema.', c.idx),
      NULL,
      c.created_at,
      c.created_at
    FROM tmp_clients c;
  ELSE
    INSERT INTO public.leads (
      id, title, client_id, stage, event_type, event_location,
      event_date, event_time, guest_count, total_budget, notes, assigned_to, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      format('Lead %02s - %s %s', c.idx, c.first_name, c.last_name),
      c.id,
      CASE
        WHEN c.idx <= 6 THEN 'novo_contato'
        WHEN c.idx <= 11 THEN 'orcamento_enviado'
        WHEN c.idx <= 17 THEN 'em_negociacao'
        WHEN c.idx <= 22 THEN 'fechados'
        ELSE 'perdidos'
      END,
      (ARRAY['casamento', '15_anos', 'formatura', 'aniversario', 'bodas', 'corporativo'])[(c.idx % 6) + 1],
      format('Espaco Ficticio %02s - Sao Paulo', c.idx),
      (current_date + ((c.idx % 8) + 1) * interval '20 days')::date,
      make_time(14 + (c.idx % 6), 0, 0),
      80 + (c.idx * 7),
      (7000 + (c.idx * 450))::numeric,
      format('Lead ficticio %s para testes integrados do sistema.', c.idx),
      NULL,
      c.created_at,
      c.created_at
    FROM tmp_clients c;
  END IF;

  INSERT INTO public.events (
    id, title, event_type, client_id, lead_id, event_date, event_time,
    location, budget_value, payment_status, notes, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    format('Evento Ficticio %02s', c.idx),
    (ARRAY['casamento', '15_anos', 'formatura', 'aniversario', 'bodas', 'corporativo'])[(c.idx % 6) + 1],
    c.id,
    l.id,
    (current_date + ((c.idx % 10) + 1) * interval '25 days')::date,
    make_time(15 + (c.idx % 5), 30, 0),
    format('Casa de Eventos %02s', c.idx),
    (8500 + (c.idx * 600))::numeric,
    CASE WHEN c.idx % 4 = 0 THEN 'pago' ELSE 'pendente' END,
    format('Evento ficticio %s para validar dashboard e recebimentos.', c.idx),
    c.created_at,
    c.created_at
  FROM tmp_clients c
  LEFT JOIN LATERAL (
    SELECT ld.id
    FROM public.leads ld
    WHERE ld.client_id = c.id
    ORDER BY ld.created_at ASC
    LIMIT 1
  ) l ON true;

  CREATE TEMP TABLE tmp_payments (
    idx INT PRIMARY KEY,
    id UUID,
    client_id UUID,
    event_id UUID,
    total_event_value NUMERIC,
    has_entry_payment BOOLEAN,
    entry_amount NUMERIC,
    entry_date DATE,
    entry_paid_at TIMESTAMPTZ,
    installment_count INT,
    created_at TIMESTAMPTZ
  ) ON COMMIT DROP;

  INSERT INTO tmp_payments (
    idx, id, client_id, event_id, total_event_value, has_entry_payment,
    entry_amount, entry_date, entry_paid_at, installment_count, created_at
  )
  SELECT
    c.idx,
    gen_random_uuid(),
    c.id,
    e.id,
    (9000 + (c.idx * 650))::numeric,
    (c.idx % 2 = 0),
    CASE WHEN c.idx % 2 = 0 THEN round((9000 + (c.idx * 650)) * 0.30, 2) ELSE NULL END,
    CASE WHEN c.idx % 2 = 0 THEN (c.created_at::date + interval '3 days')::date ELSE NULL END,
    CASE WHEN c.idx % 4 = 0 THEN (c.created_at + interval '5 days') ELSE NULL END,
    CASE
      WHEN c.idx % 5 = 0 THEN 5
      WHEN c.idx % 3 = 0 THEN 3
      ELSE 1
    END,
    c.created_at
  FROM tmp_clients c
  LEFT JOIN LATERAL (
    SELECT ev.id
    FROM public.events ev
    WHERE ev.client_id = c.id
    ORDER BY ev.created_at ASC
    LIMIT 1
  ) e ON true;

  INSERT INTO public.payments (
    id, client_id, event_id, total_event_value, has_entry_payment,
    entry_amount, entry_date, entry_paid_at, installment_count, created_at
  )
  SELECT
    id, client_id, event_id, total_event_value, has_entry_payment,
    entry_amount, entry_date, entry_paid_at, installment_count, created_at
  FROM tmp_payments;

  INSERT INTO public.payment_installments (
    id, payment_id, installment_number, due_date, amount, status, paid_at, created_at
  )
  SELECT
    gen_random_uuid(),
    p.id,
    gs,
    (
      COALESCE(p.entry_date, p.created_at::date)
      + (gs * interval '1 month')
    )::date,
    CASE
      WHEN gs = p.installment_count THEN
        (
          (p.total_event_value - COALESCE(p.entry_amount, 0))
          - (round((p.total_event_value - COALESCE(p.entry_amount, 0)) / p.installment_count, 2) * (p.installment_count - 1))
        )::numeric(12,2)
      ELSE
        round((p.total_event_value - COALESCE(p.entry_amount, 0)) / p.installment_count, 2)::numeric(12,2)
    END,
    CASE WHEN gs <= CASE WHEN p.idx % 3 = 0 THEN 2 ELSE 1 END THEN 'paid' ELSE 'pending' END,
    CASE
      WHEN gs <= CASE WHEN p.idx % 3 = 0 THEN 2 ELSE 1 END
      THEN ((COALESCE(p.entry_date, p.created_at::date) + (gs * interval '1 month'))::date + interval '2 days')
      ELSE NULL
    END,
    p.created_at
  FROM tmp_payments p
  CROSS JOIN LATERAL generate_series(1, p.installment_count) gs;

  INSERT INTO public.accounts_payable (
    id, supplier_id, description, amount, due_date, payment_status, paid_at, created_at
  )
  SELECT
    gen_random_uuid(),
    s.id,
    format('Despesa Ficticia %02s - %s', s.idx, s.company_name),
    (550 + (s.idx * 95))::numeric,
    (current_date + ((s.idx % 6) + 1) * interval '14 days')::date,
    CASE WHEN s.idx % 4 = 0 THEN 'pago' ELSE 'nao_pago' END,
    CASE WHEN s.idx % 4 = 0 THEN (now() - (s.idx * interval '2 days')) ELSE NULL END,
    (date_trunc('day', now()) - ((26 - s.idx) * interval '4 days'))
  FROM tmp_suppliers s;

  INSERT INTO public.bank_reconciliation (
    id, reference_type, reference_id, transaction_date, amount, bank_description,
    reconciliation_status, notes, created_at
  )
  SELECT
    gen_random_uuid(),
    CASE WHEN gs % 2 = 0 THEN 'recebimento' ELSE 'despesa' END,
    NULL,
    (current_date - ((6 - gs) * interval '3 days'))::date,
    CASE WHEN gs % 2 = 0 THEN (1800 + gs * 150) ELSE -(920 + gs * 110) END,
    format('Movimento bancario ficticio %s', gs),
    CASE WHEN gs <= 3 THEN 'conciliado' ELSE 'nao_conciliado' END,
    'Registro de conciliacao ficticio para validacao de dashboards.',
    now() - (gs * interval '1 day')
  FROM generate_series(1, 5) gs;

  IF to_regclass('public.bank_accounts') IS NOT NULL THEN
    CREATE TEMP TABLE tmp_bank_accounts (
      idx INT PRIMARY KEY,
      id UUID
    ) ON COMMIT DROP;

    INSERT INTO tmp_bank_accounts (idx, id)
    SELECT gs, gen_random_uuid()
    FROM generate_series(1, 5) gs;

    INSERT INTO public.bank_accounts (
      id, bank_name, bank_code, agency, account_number, account_digit,
      account_type, description, status, default_initial_balance, created_at, updated_at
    )
    SELECT
      b.id,
      format('Banco Ficticio %s', b.idx),
      lpad((100 + b.idx)::text, 3, '0'),
      lpad((5000 + b.idx)::text, 4, '0'),
      lpad((700000 + b.idx)::text, 6, '0'),
      (b.idx % 9)::text,
      CASE WHEN b.idx % 2 = 0 THEN 'corrente' ELSE 'poupanca' END,
      format('Conta de conciliacao %s', b.idx),
      'active',
      (10000 + b.idx * 2500)::numeric,
      now() - (b.idx * interval '10 days'),
      now() - (b.idx * interval '2 days')
    FROM tmp_bank_accounts b;

    IF to_regclass('public.bank_transactions') IS NOT NULL THEN
      INSERT INTO public.bank_transactions (
        id, bank_account_id, transaction_date, amount, description,
        transaction_type, status, reconciliation_id, created_at
      )
      SELECT
        gen_random_uuid(),
        b.id,
        (current_date - ((12 - gs) * interval '2 days'))::date,
        CASE WHEN gs % 2 = 0 THEN (2200 + gs * 90) ELSE -(1400 + gs * 70) END,
        format('Extrato ficticio conta %s transacao %s', b.idx, gs),
        CASE WHEN gs % 2 = 0 THEN 'credito' ELSE 'debito' END,
        CASE WHEN gs <= 2 THEN 'conciliado' ELSE 'pendente' END,
        NULL,
        now() - (gs * interval '1 day')
      FROM tmp_bank_accounts b
      CROSS JOIN generate_series(1, 4) gs;
    END IF;

    IF to_regclass('public.accounting_entries') IS NOT NULL THEN
      INSERT INTO public.accounting_entries (
        id, bank_account_id, entry_date, amount, description,
        document_number, status, reconciliation_id, created_at
      )
      SELECT
        gen_random_uuid(),
        b.id,
        (current_date - ((12 - gs) * interval '2 days'))::date,
        CASE WHEN gs % 2 = 0 THEN (2200 + gs * 90) ELSE -(1400 + gs * 70) END,
        format('Lancamento contabil ficticio conta %s item %s', b.idx, gs),
        format('DOC-%s-%s', b.idx, gs),
        CASE WHEN gs <= 2 THEN 'conciliado' ELSE 'pendente' END,
        NULL,
        now() - (gs * interval '1 day')
      FROM tmp_bank_accounts b
      CROSS JOIN generate_series(1, 4) gs;
    END IF;

    IF to_regclass('public.bank_reconciliations') IS NOT NULL THEN
      INSERT INTO public.bank_reconciliations (
        id, bank_account_id, period_start, period_end, status,
        var_tot, ext_dif_tot, cont_dif_tot, dif_tot, created_by, created_at
      )
      SELECT
        gen_random_uuid(),
        b.id,
        (current_date - interval '30 days')::date,
        current_date,
        CASE WHEN b.idx <= 3 THEN 'validado' ELSE 'cruzamento' END,
        0,
        120.50,
        120.50,
        0,
        NULL,
        now() - (b.idx * interval '3 days')
      FROM tmp_bank_accounts b;
    END IF;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

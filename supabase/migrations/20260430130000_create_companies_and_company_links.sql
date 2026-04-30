-- Multi-CNPJ foundation
create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text,
  trade_name text,
  cnpj text unique,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'companies'
      and policyname = 'Allow authenticated select companies'
  ) then
    create policy "Allow authenticated select companies"
      on public.companies
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'companies'
      and policyname = 'Allow authenticated insert companies'
  ) then
    create policy "Allow authenticated insert companies"
      on public.companies
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'companies'
      and policyname = 'Allow authenticated update companies'
  ) then
    create policy "Allow authenticated update companies"
      on public.companies
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'companies'
      and policyname = 'Allow authenticated delete companies'
  ) then
    create policy "Allow authenticated delete companies"
      on public.companies
      for delete
      to authenticated
      using (true);
  end if;
end
$$;

alter table if exists public.bank_accounts
  add column if not exists company_id uuid;

alter table if exists public.accounts_payable
  add column if not exists company_id uuid;

alter table if exists public.payments
  add column if not exists company_id uuid;

alter table if exists public.bank_transactions
  add column if not exists company_id uuid;

alter table if exists public.accounting_entries
  add column if not exists company_id uuid;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'bank_accounts') then
    if not exists (select 1 from pg_constraint where conname = 'bank_accounts_company_id_fkey') then
      alter table public.bank_accounts
        add constraint bank_accounts_company_id_fkey
        foreign key (company_id) references public.companies(id)
        on update cascade on delete set null;
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'accounts_payable') then
    if not exists (select 1 from pg_constraint where conname = 'accounts_payable_company_id_fkey') then
      alter table public.accounts_payable
        add constraint accounts_payable_company_id_fkey
        foreign key (company_id) references public.companies(id)
        on update cascade on delete set null;
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'payments') then
    if not exists (select 1 from pg_constraint where conname = 'payments_company_id_fkey') then
      alter table public.payments
        add constraint payments_company_id_fkey
        foreign key (company_id) references public.companies(id)
        on update cascade on delete set null;
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'bank_transactions') then
    if not exists (select 1 from pg_constraint where conname = 'bank_transactions_company_id_fkey') then
      alter table public.bank_transactions
        add constraint bank_transactions_company_id_fkey
        foreign key (company_id) references public.companies(id)
        on update cascade on delete set null;
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'accounting_entries') then
    if not exists (select 1 from pg_constraint where conname = 'accounting_entries_company_id_fkey') then
      alter table public.accounting_entries
        add constraint accounting_entries_company_id_fkey
        foreign key (company_id) references public.companies(id)
        on update cascade on delete set null;
    end if;
  end if;
end
$$;

create index if not exists idx_companies_cnpj on public.companies(cnpj);
create index if not exists idx_bank_accounts_company_id on public.bank_accounts(company_id);
create index if not exists idx_accounts_payable_company_id on public.accounts_payable(company_id);
create index if not exists idx_payments_company_id on public.payments(company_id);
create index if not exists idx_bank_transactions_company_id on public.bank_transactions(company_id);
create index if not exists idx_accounting_entries_company_id on public.accounting_entries(company_id);

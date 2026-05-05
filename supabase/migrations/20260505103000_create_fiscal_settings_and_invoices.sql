create extension if not exists pgcrypto;

create table if not exists public.company_fiscal_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  provider text not null default 'focus_nfe',
  environment text not null default 'homologation' check (environment in ('homologation', 'production')),
  municipal_registration text,
  tax_regime text,
  cnae text,
  service_code_default text,
  iss_rate numeric(5,2) not null default 0,
  rps_series text,
  next_rps_number bigint,
  provider_account_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  payment_id uuid references public.payments(id) on delete set null,
  client_id uuid not null references public.clients(id),
  status text not null default 'draft' check (status in ('draft', 'processing', 'authorized', 'rejected', 'cancelled')),
  issue_attempts integer not null default 0,
  idempotency_key text not null,
  provider text not null,
  provider_reference text,
  rps_series text,
  rps_number bigint,
  invoice_number text,
  verification_code text,
  amount_services numeric(14,2) not null,
  amount_deductions numeric(14,2) not null default 0,
  amount_iss numeric(14,2) not null default 0,
  amount_net numeric(14,2) not null,
  xml_url text,
  pdf_url text,
  error_code text,
  error_message text,
  issued_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_unique_idempotency unique (idempotency_key)
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  service_code text,
  quantity numeric(12,3) not null default 1,
  unit_amount numeric(14,2) not null,
  total_amount numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_fiscal_settings_company_id on public.company_fiscal_settings(company_id);
create index if not exists idx_invoices_company_status_created_at on public.invoices(company_id, status, created_at desc);
create index if not exists idx_invoices_payment_id on public.invoices(payment_id);
create index if not exists idx_invoices_client_id on public.invoices(client_id);
create index if not exists idx_invoice_items_invoice_id on public.invoice_items(invoice_id);
create index if not exists idx_invoice_events_invoice_id_created_at on public.invoice_events(invoice_id, created_at desc);

alter table public.company_fiscal_settings enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'company_fiscal_settings' and policyname = 'Allow authenticated select company fiscal settings'
  ) then
    create policy "Allow authenticated select company fiscal settings"
      on public.company_fiscal_settings for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'company_fiscal_settings' and policyname = 'Allow authenticated insert company fiscal settings'
  ) then
    create policy "Allow authenticated insert company fiscal settings"
      on public.company_fiscal_settings for insert to authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'company_fiscal_settings' and policyname = 'Allow authenticated update company fiscal settings'
  ) then
    create policy "Allow authenticated update company fiscal settings"
      on public.company_fiscal_settings for update to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoices' and policyname = 'Allow authenticated select invoices'
  ) then
    create policy "Allow authenticated select invoices"
      on public.invoices for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoices' and policyname = 'Allow authenticated insert invoices'
  ) then
    create policy "Allow authenticated insert invoices"
      on public.invoices for insert to authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoices' and policyname = 'Allow authenticated update invoices'
  ) then
    create policy "Allow authenticated update invoices"
      on public.invoices for update to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoice_items' and policyname = 'Allow authenticated select invoice items'
  ) then
    create policy "Allow authenticated select invoice items"
      on public.invoice_items for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoice_items' and policyname = 'Allow authenticated insert invoice items'
  ) then
    create policy "Allow authenticated insert invoice items"
      on public.invoice_items for insert to authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoice_items' and policyname = 'Allow authenticated update invoice items'
  ) then
    create policy "Allow authenticated update invoice items"
      on public.invoice_items for update to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoice_events' and policyname = 'Allow authenticated select invoice events'
  ) then
    create policy "Allow authenticated select invoice events"
      on public.invoice_events for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoice_events' and policyname = 'Allow authenticated insert invoice events'
  ) then
    create policy "Allow authenticated insert invoice events"
      on public.invoice_events for insert to authenticated with check (true);
  end if;
end
$$;

drop trigger if exists trg_company_fiscal_settings_updated_at on public.company_fiscal_settings;
create trigger trg_company_fiscal_settings_updated_at
before update on public.company_fiscal_settings
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
before update on public.invoices
for each row execute function public.update_updated_at_column();

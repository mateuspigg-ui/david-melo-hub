create table if not exists public.accounts_payable_cost_centers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table if exists public.accounts_payable
  add column if not exists cost_center_id uuid references public.accounts_payable_cost_centers(id) on delete set null;

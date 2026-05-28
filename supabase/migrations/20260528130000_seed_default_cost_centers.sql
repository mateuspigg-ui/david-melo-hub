insert into public.accounts_payable_cost_centers (name)
values
  ('Operacional'),
  ('Marketing'),
  ('Comercial'),
  ('Administrativo')
on conflict (name) do nothing;

create table if not exists public.accounts_payable_attachments (
  id uuid primary key default gen_random_uuid(),
  account_payable_id uuid not null references public.accounts_payable(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_size bigint,
  content_type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_accounts_payable_attachments_payable_id
  on public.accounts_payable_attachments(account_payable_id);

alter table public.accounts_payable_attachments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'accounts_payable_attachments'
      and policyname = 'attachments_select_authenticated'
  ) then
    create policy attachments_select_authenticated
      on public.accounts_payable_attachments
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'accounts_payable_attachments'
      and policyname = 'attachments_insert_authenticated'
  ) then
    create policy attachments_insert_authenticated
      on public.accounts_payable_attachments
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'accounts_payable_attachments'
      and policyname = 'attachments_delete_authenticated'
  ) then
    create policy attachments_delete_authenticated
      on public.accounts_payable_attachments
      for delete
      to authenticated
      using (true);
  end if;
end
$$;

insert into storage.buckets (id, name, public)
values ('payable-attachments', 'payable-attachments', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'payable_attachments_read_authenticated'
  ) then
    create policy payable_attachments_read_authenticated
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'payable-attachments');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'payable_attachments_insert_authenticated'
  ) then
    create policy payable_attachments_insert_authenticated
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'payable-attachments');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'payable_attachments_delete_authenticated'
  ) then
    create policy payable_attachments_delete_authenticated
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'payable-attachments');
  end if;
end
$$;

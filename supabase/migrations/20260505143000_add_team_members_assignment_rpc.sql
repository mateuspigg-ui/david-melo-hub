create or replace function public.get_team_members_for_assignment()
returns table (
  id uuid,
  full_name text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    p.id,
    p.full_name,
    p.email
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  where ur.role = 'team_member'::public.app_role
  order by p.full_name asc nulls last, p.email asc nulls last;
$$;

grant execute on function public.get_team_members_for_assignment() to authenticated;

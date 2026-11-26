-- Supabase / PostgreSQL Schema & Row Level Security for HMS Admin Role Protection
-- Run in Supabase SQL Editor.

-- 1. Ensure public.profiles exists with constrained role values:
--    'patient', 'doctor', 'candidate', 'hospital_staff', 'admin'
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  phone text,
  role text not null default 'patient'
    check (role in ('patient', 'doctor', 'candidate', 'hospital_staff', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If public.profiles already exists without the role check constraint, apply/refresh it safely:
alter table public.profiles
  add column if not exists role text not null default 'patient';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('patient', 'doctor', 'candidate', 'hospital_staff', 'admin'));

-- 2. Enable Row Level Security on public.profiles
alter table public.profiles enable row level security;

-- Helper function (SECURITY DEFINER avoids recursive RLS evaluation on profiles)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 3. RLS Policies
drop policy if exists "Users can view own profile; admins can view all" on public.profiles;
create policy "Users can view own profile; admins can view all"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

-- Prevent self-registration as admin: authenticated users may only insert own non-admin profile,
-- while admins may provision any role including 'admin'.
drop policy if exists "Prevent non-admin self-promotion on insert" on public.profiles;
create policy "Prevent non-admin self-promotion on insert"
  on public.profiles
  for insert
  to authenticated
  with check (
    (auth.uid() = id and role in ('patient', 'doctor', 'candidate', 'hospital_staff'))
    or public.is_admin()
  );

-- Normal users can update their own profile details ONLY if role remains unchanged.
-- Only users with role = 'admin' can update other users' profiles or change roles.
drop policy if exists "Users update own profile without role change; admins update any" on public.profiles;
create policy "Users update own profile without role change; admins update any"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (
    public.is_admin()
    or (
      auth.uid() = id
      and role = (select p.role from public.profiles p where p.id = auth.uid())
    )
  );

-- 4. Bootstrap First Admin Manually (run in Supabase SQL Editor after creating user in Auth > Users):
-- update public.profiles set role = 'admin' where email = 'MY_EMAIL_HERE';

-- Supabase / PostgreSQL Migration: Prescriptions & Payments with Row Level Security
-- Run in Supabase SQL Editor (requires public.profiles & public.is_admin() from supabase_admin_rls.sql).

-- =====================================================================
-- 1. PRESCRIPTIONS TABLE & RLS
-- =====================================================================
create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  prescription_ref text unique not null,
  patient_id uuid not null references public.profiles(id) on delete restrict,
  doctor_id uuid not null references public.profiles(id) on delete restrict,
  appointment_id uuid,
  diagnosis text not null,
  symptoms text,
  medicines jsonb not null default '[]'::jsonb,
  tests_recommended text[] not null default '{}',
  advice text,
  follow_up_date date,
  created_at timestamptz not null default now()
);

create index if not exists idx_supa_prescriptions_patient on public.prescriptions(patient_id, created_at desc);
create index if not exists idx_supa_prescriptions_doctor on public.prescriptions(doctor_id, created_at desc);

alter table public.prescriptions enable row level security;

-- Patients see only their own; doctors see ones they wrote; admins see all
drop policy if exists "Prescriptions read policy" on public.prescriptions;
create policy "Prescriptions read policy"
  on public.prescriptions
  for select
  to authenticated
  using (
    auth.uid() = patient_id
    or auth.uid() = doctor_id
    or public.is_admin()
  );

-- Only authenticated doctors (writing under their own doctor_id) or admins can insert prescriptions
drop policy if exists "Doctors and admins can create prescriptions" on public.prescriptions;
create policy "Doctors and admins can create prescriptions"
  on public.prescriptions
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      auth.uid() = doctor_id
      and exists (
        select 1 from public.profiles p where p.id = auth.uid() and p.role = 'doctor'
      )
    )
  );

-- =====================================================================
-- 2. PAYMENTS TABLE & RLS
-- =====================================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  bill_ref text unique not null,
  patient_id uuid not null references public.profiles(id) on delete restrict,
  bill_type text not null check (bill_type in ('consultation', 'lab test', 'medicine', 'room', 'other')),
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'verification_pending', 'paid', 'failed')),
  transaction_id text,
  payment_method text not null default 'UPI QR',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_supa_payments_patient on public.payments(patient_id, created_at desc);
create index if not exists idx_supa_payments_status on public.payments(status, created_at desc);

alter table public.payments enable row level security;

-- Patients see only their own bills; hospital staff and admins see all
drop policy if exists "Payments read policy" on public.payments;
create policy "Payments read policy"
  on public.payments
  for select
  to authenticated
  using (
    auth.uid() = patient_id
    or public.is_admin()
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'hospital_staff'
    )
  );

-- Only hospital staff and admins can create bills
drop policy if exists "Staff and admins can create bills" on public.payments;
create policy "Staff and admins can create bills"
  on public.payments
  for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'hospital_staff'
    )
  );

-- Patients can submit a UPI transaction_id moving 'pending'/'failed' -> 'verification_pending' (NEVER 'paid').
-- Only hospital staff and admins (or service-role Edge Function) can mark 'paid' or 'failed'.
drop policy if exists "Patients submit UPI verification; staff/admins confirm payments" on public.payments;
create policy "Patients submit UPI verification; staff/admins confirm payments"
  on public.payments
  for update
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'hospital_staff'
    )
    or (auth.uid() = patient_id and status in ('pending', 'failed'))
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'hospital_staff'
    )
    or (
      auth.uid() = patient_id
      and status = 'verification_pending'
      and transaction_id is not null
      and length(trim(transaction_id)) >= 6
      and paid_at is null
    )
  );

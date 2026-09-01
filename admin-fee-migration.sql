-- PEPMOSA admin fee + GB cleanup migration
create extension if not exists pgcrypto;

create table if not exists public.admin_fee_payments (
  id uuid primary key default gen_random_uuid(),
  gb_number text not null references public.group_buys(gb_number) on delete cascade,
  email text not null,
  amount numeric(12,2) not null default 0,
  payment_reference text not null,
  note text,
  status text not null default 'SUBMITTED' check(status in ('SUBMITTED','PAID','REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_fee_payments_gb_email on public.admin_fee_payments(gb_number,email);
create index if not exists idx_admin_fee_payments_created on public.admin_fee_payments(created_at desc);

alter table public.admin_fee_payments enable row level security;

drop policy if exists "public insert admin fee payment" on public.admin_fee_payments;
create policy "public insert admin fee payment" on public.admin_fee_payments
  for insert with check (length(trim(email)) > 3 and length(trim(payment_reference)) > 0);

drop policy if exists "admin read admin fee payments" on public.admin_fee_payments;
create policy "admin read admin fee payments" on public.admin_fee_payments
  for select using (is_admin());

drop policy if exists "admin update admin fee payments" on public.admin_fee_payments;
create policy "admin update admin fee payments" on public.admin_fee_payments
  for update using (is_admin()) with check (is_admin());

-- Existing orders currently prevent deleting a Group Buy because their FK is not cascading.
alter table public.orders drop constraint if exists orders_gb_number_fkey;
alter table public.orders
  add constraint orders_gb_number_fkey
  foreign key (gb_number) references public.group_buys(gb_number) on delete cascade;

-- Keep the admin UI's KIT_COMPLETION status valid.
alter table public.group_buys drop constraint if exists group_buys_status_check;
alter table public.group_buys
  add constraint group_buys_status_check
  check(status in ('OPEN','CLOSED','KIT_COMPLETION'));

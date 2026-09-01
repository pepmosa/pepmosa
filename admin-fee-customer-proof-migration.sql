-- PEPMOSA: admin fee customer details + payment proof
-- Run this once in Supabase SQL Editor.

alter table public.admin_fee_payments
  add column if not exists full_name text,
  add column if not exists telegram_name text,
  add column if not exists phone text,
  add column if not exists payment_proof_url text;

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', true)
on conflict (id) do update set public = true;

drop policy if exists "anon upload payment proofs" on storage.objects;
create policy "anon upload payment proofs"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'payment-proofs');

drop policy if exists "public read payment proofs" on storage.objects;
create policy "public read payment proofs"
on storage.objects for select to public
using (bucket_id = 'payment-proofs');

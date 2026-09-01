-- PEPMOSA: admin fee customer details + payment proof
-- Run this ONCE in Supabase SQL Editor.

alter table public.admin_fee_payments
  add column if not exists full_name text,
  add column if not exists telegram_name text,
  add column if not exists phone text,
  add column if not exists payment_proof_url text;

-- Email is attached only after the customer verifies it.
alter table public.admin_fee_payments alter column email drop not null;

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

-- Called after the email verification redirect to attach the verified email
-- to the exact approved payment submission created on this browser.
create or replace function public.claim_admin_fee_payment(p_payment_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_email is null or length(trim(p_email)) < 5 then
    return false;
  end if;
  update public.admin_fee_payments
  set email=lower(trim(p_email)), updated_at=now()
  where id=p_payment_id and status='PAID';
  return found;
end;
$$;

revoke all on function public.claim_admin_fee_payment(uuid,text) from public;
grant execute on function public.claim_admin_fee_payment(uuid,text) to anon, authenticated;

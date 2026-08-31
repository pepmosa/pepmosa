-- PEPMOSA NEW SUPABASE SCHEMA
-- Run this entire file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists products(
  product_id text primary key,
  product_name text not null,
  category text,
  description text,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists product_variants(
  variant_id text primary key,
  product_id text not null references products(product_id) on delete cascade,
  strength text not null,
  price numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists categories(
  category_name text primary key,
  active boolean not null default true
);

create table if not exists group_buys(
  gb_id uuid primary key default gen_random_uuid(),
  gb_number text unique not null,
  customer_facing_name text,
  status text not null default 'CLOSED' check(status in ('OPEN','CLOSED')),
  admin_fee numeric(12,2) not null default 0,
  admin_fee_qr_url text,
  final_payment_qr_url text,
  kit_completion_status text not null default 'CLOSED' check(kit_completion_status in ('OPEN','CLOSED')),
  created_at timestamptz not null default now()
);

create table if not exists gb_categories(
  gb_number text not null references group_buys(gb_number) on delete cascade,
  category_name text not null references categories(category_name) on delete cascade,
  primary key(gb_number,category_name)
);

-- THIS IS THE PER-GB, PER-PRODUCT, PER-VARIANT MINIMUM.
create table if not exists gb_minimum_quantities(
  gb_number text not null references group_buys(gb_number) on delete cascade,
  product_id text not null references products(product_id) on delete cascade,
  variant_id text not null references product_variants(variant_id) on delete cascade,
  minimum_qty integer not null default 1 check(minimum_qty >= 1),
  primary key(gb_number,product_id,variant_id)
);

create table if not exists customers(
  customer_id uuid primary key default gen_random_uuid(),
  email text unique not null,
  customer_name text,
  contact text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists orders(
  order_id text primary key default ('ORD-'||to_char(now(),'YYYYMMDDHH24MISSMS')),
  gb_number text not null references group_buys(gb_number),
  customer_id uuid references customers(customer_id),
  email text not null,
  total numeric(12,2) not null default 0,
  payment_status text not null default 'PENDING',
  shipping_method text,
  shipping_fee numeric(12,2) not null default 0,
  admin_note text,
  created_at timestamptz not null default now()
);

create table if not exists order_items(
  order_item_id uuid primary key default gen_random_uuid(),
  order_id text not null references orders(order_id) on delete cascade,
  product_id text references products(product_id),
  variant_id text references product_variants(variant_id),
  product_name text not null,
  strength text,
  qty integer not null check(qty>0),
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0
);

create table if not exists kit_inventory(
  kit_inventory_id uuid primary key default gen_random_uuid(),
  gb_number text not null references group_buys(gb_number) on delete cascade,
  variant_id text not null references product_variants(variant_id) on delete cascade,
  remaining_qty integer not null default 0 check(remaining_qty>=0),
  kit_size integer not null default 10 check(kit_size>=1),
  updated_at timestamptz not null default now(),
  unique(gb_number,variant_id)
);

create table if not exists kit_reservations(
  reservation_id uuid primary key default gen_random_uuid(),
  gb_number text not null references group_buys(gb_number),
  variant_id text not null references product_variants(variant_id),
  customer_id uuid references customers(customer_id),
  quantity integer not null check(quantity>=1),
  status text not null default 'RESERVED' check(status in ('RESERVED','RELEASED','COMPLETED')),
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_email on orders(email);
create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_min_gb_variant on gb_minimum_quantities(gb_number,variant_id);

-- Atomic reservation. This is the important anti-double-selling lock.
create or replace function reserve_kit_units(
  p_gb_number text,
  p_variant_id text,
  p_quantity integer,
  p_customer_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_remaining integer;
  v_id uuid;
begin
  if p_quantity < 1 then raise exception 'Quantity must be at least 1'; end if;

  select remaining_qty into v_remaining
  from kit_inventory
  where gb_number=p_gb_number and variant_id=p_variant_id
  for update;

  if not found then raise exception 'No kit completion stock configured'; end if;
  if v_remaining < p_quantity then
    raise exception 'Only % pc remaining for kit completion', v_remaining;
  end if;

  update kit_inventory
  set remaining_qty=remaining_qty-p_quantity, updated_at=now()
  where gb_number=p_gb_number and variant_id=p_variant_id;

  insert into kit_reservations(gb_number,variant_id,customer_id,quantity)
  values(p_gb_number,p_variant_id,p_customer_id,p_quantity)
  returning reservation_id into v_id;

  return jsonb_build_object(
    'reservation_id',v_id,
    'gb_number',p_gb_number,
    'variant_id',p_variant_id,
    'reserved_qty',p_quantity,
    'remaining_qty',v_remaining-p_quantity
  );
end;
$$;

-- Public reads; writes are admin-only.
alter table products enable row level security;
alter table product_variants enable row level security;
alter table categories enable row level security;
alter table group_buys enable row level security;
alter table gb_categories enable row level security;
alter table gb_minimum_quantities enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table profiles enable row level security;
alter table kit_inventory enable row level security;
alter table kit_reservations enable row level security;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from profiles where id=auth.uid() and is_admin=true); $$;

create policy "public read active products" on products for select using (active=true or is_admin());
create policy "admin products write" on products for all using(is_admin()) with check(is_admin());
create policy "public read active variants" on product_variants for select using (active=true or is_admin());
create policy "admin variants write" on product_variants for all using(is_admin()) with check(is_admin());
create policy "public read categories" on categories for select using(active=true or is_admin());
create policy "admin categories write" on categories for all using(is_admin()) with check(is_admin());
create policy "public read open GB" on group_buys for select using(status='OPEN' or is_admin());
create policy "admin GB write" on group_buys for all using(is_admin()) with check(is_admin());
create policy "public read GB categories" on gb_categories for select using(true);
create policy "admin GB categories write" on gb_categories for all using(is_admin()) with check(is_admin());
create policy "public read GB minimums" on gb_minimum_quantities for select using(true);
create policy "admin GB minimums write" on gb_minimum_quantities for all using(is_admin()) with check(is_admin());
create policy "customer insert profile" on customers for insert with check(true);
create policy "customer update own email" on customers for update using(true) with check(true);
create policy "customer read own email orders" on orders for select using(is_admin() or lower(email)=lower(coalesce((auth.jwt()->>'email'),'')));
create policy "customer insert orders" on orders for insert with check(true);
create policy "admin orders write" on orders for update using(is_admin()) with check(is_admin());
create policy "customer insert items" on order_items for insert with check(true);
create policy "customer read items" on order_items for select using(is_admin() or exists(select 1 from orders o where o.order_id=order_items.order_id and lower(o.email)=lower(coalesce((auth.jwt()->>'email'),''))));
create policy "admin items write" on order_items for all using(is_admin()) with check(is_admin());
create policy "profiles own read" on profiles for select using(id=auth.uid() or is_admin());
create policy "admin profiles write" on profiles for all using(is_admin()) with check(is_admin());
create policy "public read kit inventory" on kit_inventory for select using(true);
create policy "admin kit write" on kit_inventory for all using(is_admin()) with check(is_admin());
create policy "customer read own reservations" on kit_reservations for select using(is_admin() or customer_id in(select customer_id from customers where lower(email)=lower(coalesce((auth.jwt()->>'email'),''))));
create policy "admin reservations write" on kit_reservations for all using(is_admin()) with check(is_admin());

grant execute on function reserve_kit_units(text,text,integer,uuid) to anon,authenticated;

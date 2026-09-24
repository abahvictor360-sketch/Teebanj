-- Initial storefront schema. Payments remain disabled until Square setup is verified.

create table if not exists public.products (
  id text primary key,
  square_item_id text not null,
  name text not null,
  description text not null default '',
  category text not null default 'fabrics',
  variation_name text not null default 'Default',
  sku text not null default '',
  price_cents bigint not null check (price_cents > 0),
  image_url text not null default '',
  stock numeric(16,5) not null default 0 check (stock >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  customer jsonb not null,
  square_request jsonb not null,
  request_hash text not null,
  guest_token_hash text,
  square_order_id text unique,
  payment_link_id text,
  checkout_url text,
  status text not null default 'pending' check (status in ('pending','paid','shipped','cancelled','refund_review')),
  total_cents bigint,
  payment_id text unique,
  receipt_url text,
  tracking text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id),
  name text not null,
  quantity integer not null check (quantity > 0 and quantity <= 99),
  price_cents bigint not null check (price_cents > 0),
  primary key (order_id, product_id)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.subscribers (
  email text primary key,
  consent_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id text primary key,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.messages enable row level security;
alter table public.subscribers enable row level security;
alter table public.webhook_events enable row level security;

revoke all on public.products, public.orders, public.order_items, public.messages, public.subscribers, public.webhook_events from anon, authenticated;
grant select on public.products to anon, authenticated;
grant select (id, user_id, status, total_cents, tracking, created_at, updated_at) on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant all on public.products, public.orders, public.order_items, public.messages, public.subscribers, public.webhook_events to service_role;
grant usage, select on sequence public.messages_id_seq to service_role;

create policy "published products are public" on public.products for select to anon, authenticated using (active = true);
create policy "users read their own orders" on public.orders for select to authenticated using ((select auth.uid()) = user_id);
create policy "users read their own order items" on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

create index if not exists products_active_category_idx on public.products (category) where active;
create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_updated_idx on public.orders (status, updated_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

create table public.store_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.store_admins enable row level security;
revoke all on public.store_admins from anon, authenticated;
grant all on public.store_admins to service_role;

create table public.request_limits (
  key text primary key,
  bucket timestamptz not null,
  hits integer not null
);
alter table public.request_limits enable row level security;
revoke all on public.request_limits from anon, authenticated;
grant all on public.request_limits to service_role;
create function public.take_request_slot(p_key text, p_limit integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  insert into public.request_limits as r (key, bucket, hits)
  values (p_key, date_trunc('hour', now()), 1)
  on conflict (key) do update set
    bucket = date_trunc('hour', now()),
    hits = case when r.bucket = date_trunc('hour', now()) then r.hits + 1 else 1 end
  returning hits into n;
  return n <= p_limit;
end $$;
revoke execute on function public.take_request_slot(text, integer) from public, anon, authenticated;
grant execute on function public.take_request_slot(text, integer) to service_role;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- These tables are server-only. No client role may read or write their rows.
create policy server_only on public.messages for all to service_role using (true) with check (true);
create policy server_only on public.subscribers for all to service_role using (true) with check (true);
create policy server_only on public.webhook_events for all to service_role using (true) with check (true);
create policy server_only on public.store_admins for all to service_role using (true) with check (true);
create policy server_only on public.request_limits for all to service_role using (true) with check (true);
create index order_items_product_idx on public.order_items(product_id);

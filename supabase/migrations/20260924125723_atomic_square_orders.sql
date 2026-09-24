-- Server-only transactions: clients cannot choose prices or assign ownership.
create function public.create_checkout(p_id uuid, p_user uuid, p_hash text, p_customer jsonb, p_request jsonb, p_total bigint, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.orders; inserted integer;
begin
 insert into public.orders(id,user_id,request_hash,customer,square_request,total_cents)
 values(p_id,p_user,p_hash,p_customer,p_request,p_total) on conflict(id) do nothing;
 get diagnostics inserted = row_count;
 select * into existing from public.orders where id=p_id for update;
 if existing.user_id is distinct from p_user or existing.request_hash <> p_hash then raise exception 'Checkout reference already used'; end if;
 if inserted=1 then
  insert into public.order_items(order_id,product_id,name,quantity,price_cents)
  select p_id,x.product_id,x.name,x.quantity,x.price_cents
  from jsonb_to_recordset(p_items) as x(product_id text,name text,quantity integer,price_cents bigint);
 end if;
 return to_jsonb(existing);
end $$;
revoke execute on function public.create_checkout(uuid,uuid,text,jsonb,jsonb,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.create_checkout(uuid,uuid,text,jsonb,jsonb,bigint,jsonb) to service_role;

create function public.replace_square_catalog(p_rows jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
 perform pg_advisory_xact_lock(729158);
 update public.products set active=false;
 insert into public.products(id,square_item_id,name,description,category,variation_name,sku,price_cents,image_url,stock,active)
 select id,square_item_id,name,description,category,variation_name,sku,price_cents,image_url,stock,true
 from jsonb_to_recordset(p_rows) as x(id text,square_item_id text,name text,description text,category text,variation_name text,sku text,price_cents bigint,image_url text,stock numeric)
 on conflict(id) do update set square_item_id=excluded.square_item_id,name=excluded.name,description=excluded.description,category=excluded.category,variation_name=excluded.variation_name,sku=excluded.sku,price_cents=excluded.price_cents,image_url=excluded.image_url,stock=excluded.stock,active=true;
 get diagnostics n=row_count;
 return n;
end $$;
revoke execute on function public.replace_square_catalog(jsonb) from public,anon,authenticated;
grant execute on function public.replace_square_catalog(jsonb) to service_role;

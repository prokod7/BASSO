-- Atomic operational actions used by the application APIs.

create or replace function public.assign_delivery(p_order_id text,p_driver_id uuid,p_token_hash text,p_expires_at timestamptz,p_actor_id uuid default auth.uid()) returns void
language plpgsql security definer set search_path=public as $$
declare v_driver public.drivers%rowtype; v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.channel<>'own_delivery' then raise exception 'Atribuição disponível somente para delivery próprio'; end if;
  if v_order.status not in ('ready','confirmed','preparing') then raise exception 'Pedido ainda não está disponível para despacho'; end if;
  select * into v_driver from public.drivers where id=p_driver_id and active for update;
  if not found then raise exception 'Motoboy não encontrado'; end if;
  if not v_driver.available and v_driver.active_order_id is distinct from p_order_id then raise exception 'Motoboy já está em outra entrega'; end if;
  update public.drivers set available=false,active_order_id=p_order_id,updated_at=now() where id=p_driver_id;
  update public.orders set driver_id=p_driver_id,updated_at=now() where id=p_order_id;
  insert into public.tracking_tokens(order_id,token_hash,expires_at) values(p_order_id,p_token_hash,p_expires_at)
  on conflict(order_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked_at=null;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'DRIVER_ASSIGNED','order',p_order_id,jsonb_build_object('driverId',p_driver_id,'expiresAt',p_expires_at));
end $$;

grant execute on function public.assign_delivery(text,uuid,text,timestamptz,uuid) to authenticated,service_role;

create or replace function public.set_table_status(p_table_number integer,p_status text,p_people_count integer,p_actor_id uuid default auth.uid()) returns void
language plpgsql security definer set search_path=public as $$
declare v_old public.restaurant_tables%rowtype; v_capacity integer;
begin
  if p_table_number not between 1 and 15 then raise exception 'Mesa inválida'; end if;
  if p_status not in ('free','occupied','cleaning','partial') then raise exception 'Status inválido'; end if;
  select * into v_old from public.restaurant_tables where number=p_table_number for update;
  if not found then raise exception 'Mesa não cadastrada'; end if;
  v_capacity:=v_old.capacity;
  if p_people_count is not null and p_people_count>greatest(v_capacity,20) then raise exception 'Quantidade de pessoas inválida'; end if;
  if p_status='free' and exists(select 1 from public.tabs where table_number=p_table_number and status in ('open','partial')) then raise exception 'Existem comandas abertas na mesa'; end if;
  update public.restaurant_tables set status=p_status,people_count=case when p_status='free' then null else p_people_count end,opened_at=case when p_status='occupied' and opened_at is null then now() when p_status='free' then null else opened_at end,opened_by=case when p_status='occupied' and opened_by is null then p_actor_id when p_status='free' then null else opened_by end,version=version+1,updated_at=now() where number=p_table_number;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'TABLE_STATUS_CHANGED','table',p_table_number::text,to_jsonb(v_old),jsonb_build_object('status',p_status,'people',p_people_count));
end $$;

grant execute on function public.set_table_status(integer,text,integer,uuid) to authenticated,service_role;

create or replace function public.adjust_inventory(p_inventory_id uuid,p_delta numeric,p_reason text,p_idempotency_key text,p_actor_id uuid default auth.uid()) returns numeric
language plpgsql security definer set search_path=public as $$
declare v_item public.inventory_items%rowtype; v_next numeric;
begin
  if exists(select 1 from public.inventory_movements where idempotency_key=p_idempotency_key) then select quantity into v_next from public.inventory_items where id=p_inventory_id; return v_next; end if;
  select * into v_item from public.inventory_items where id=p_inventory_id for update;
  if not found then raise exception 'Item de estoque não encontrado'; end if;
  v_next:=v_item.quantity+p_delta;
  if v_next<0 and not v_item.allow_negative then raise exception 'Saldo de estoque insuficiente'; end if;
  update public.inventory_items set quantity=v_next,version=version+1,updated_at=now() where id=p_inventory_id;
  insert into public.inventory_movements(inventory_item_id,kind,delta,reason,created_by,idempotency_key) values(p_inventory_id,'adjustment',p_delta,p_reason,p_actor_id,p_idempotency_key);
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data) values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'INVENTORY_ADJUSTED','inventory',p_inventory_id::text,p_reason,jsonb_build_object('quantity',v_item.quantity),jsonb_build_object('quantity',v_next,'delta',p_delta));
  return v_next;
end $$;

grant execute on function public.adjust_inventory(uuid,numeric,text,text,uuid) to authenticated,service_role;

create or replace function public.open_cash_session(p_initial_cents integer,p_actor_id uuid default auth.uid()) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if exists(select 1 from public.cash_sessions where status='open') then raise exception 'Já existe um caixa aberto'; end if;
  insert into public.cash_sessions(opened_by,initial_cents) values(p_actor_id,p_initial_cents) returning id into v_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data) values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'CASH_OPENED','cash_session',v_id::text,jsonb_build_object('initialCents',p_initial_cents));
  return v_id;
end $$;

create or replace function public.close_cash_session(p_declared_cents integer,p_notes text,p_actor_id uuid default auth.uid()) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_session public.cash_sessions%rowtype; v_expected integer; v_id uuid;
begin
  select * into v_session from public.cash_sessions where status='open' order by opened_at desc limit 1 for update;
  if not found then raise exception 'Não existe caixa aberto'; end if;
  select v_session.initial_cents+coalesce(sum(amount_cents),0) into v_expected from public.cash_movements where session_id=v_session.id;
  update public.cash_sessions set status='closed',closed_by=p_actor_id,closed_at=now(),declared_cents=p_declared_cents,expected_cents=v_expected,difference_cents=p_declared_cents-v_expected,notes=p_notes where id=v_session.id returning id into v_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data) values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'CASH_CLOSED','cash_session',v_id::text,p_notes,to_jsonb(v_session),jsonb_build_object('declaredCents',p_declared_cents,'expectedCents',v_expected,'differenceCents',p_declared_cents-v_expected));
  return v_id;
end $$;

grant execute on function public.open_cash_session(integer,uuid) to authenticated,service_role;
grant execute on function public.close_cash_session(integer,text,uuid) to authenticated,service_role;

-- Coupon locking and stock restriction are applied after an order is inserted in the same transaction.
create or replace function public.apply_order_coupon_and_stock() returns trigger language plpgsql security definer set search_path=public as $$
declare v_coupon public.coupons%rowtype; v_item public.order_items%rowtype; v_inventory public.inventory_items%rowtype; v_beverage text;
begin
  if new.coupon_code is not null and new.coupon_code<>'' then
    select * into v_coupon from public.coupons where code=new.coupon_code for update;
    if not found or not v_coupon.active or (v_coupon.starts_at is not null and v_coupon.starts_at>now()) or (v_coupon.ends_at is not null and v_coupon.ends_at<now()) or (v_coupon.total_limit is not null and v_coupon.uses>=v_coupon.total_limit) or not (new.channel=any(v_coupon.channels)) or (v_coupon.minimum_cents is not null and new.subtotal_cents<v_coupon.minimum_cents) then raise exception 'Cupom inválido ou esgotado'; end if;
    update public.coupons set uses=uses+1,updated_at=now() where id=v_coupon.id;
    insert into public.coupon_redemptions(coupon_id,order_id,discount_cents) values(v_coupon.id,new.id,new.discount_cents);
  elsif new.discount_cents>0 then
    -- Manual discount is allowed only for authenticated operational creation, never anonymous public checkout.
    if auth.uid() is null then raise exception 'Desconto sem cupom não autorizado'; end if;
  end if;
  return new;
end $$;

create trigger order_coupon_guard after insert on public.orders for each row execute function public.apply_order_coupon_and_stock();

create or replace function public.decrement_order_stock(p_order_id text) returns void language plpgsql security definer set search_path=public as $$
declare v_item public.order_items%rowtype; v_inventory public.inventory_items%rowtype; v_product_id text; v_delta numeric;
begin
  for v_item in select * from public.order_items where order_id=p_order_id loop
    v_product_id:=case when v_item.kind='product' then v_item.product_id when v_item.kind='combo' then v_item.selection->>'beverage' else null end;
    if v_product_id is null then continue; end if;
    select * into v_inventory from public.inventory_items where product_id=v_product_id for update;
    if not found then continue; end if;
    v_delta:=-v_item.quantity;
    if v_inventory.quantity+v_delta<0 and not v_inventory.allow_negative then raise exception 'Estoque insuficiente para %',v_product_id; end if;
    update public.inventory_items set quantity=quantity+v_delta,version=version+1,updated_at=now() where id=v_inventory.id;
    insert into public.inventory_movements(inventory_item_id,kind,delta,order_id,reason,idempotency_key) values(v_inventory.id,'sale',v_delta,p_order_id,'Baixa automática por pedido',p_order_id||':'||v_item.id);
  end loop;
end $$;

grant execute on function public.decrement_order_stock(text) to service_role;

-- Replace order creation to include stock decrement after every item was inserted.
create or replace function public.create_order_transaction(p_order jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_order_id text := p_order->>'id'; v_item jsonb; v_customer_id uuid; v_phone text := coalesce(p_order->>'customerPhone','');
begin
  if exists(select 1 from public.orders where source_idempotency_key=p_order->>'sourceIdempotencyKey') then return jsonb_build_object('id',v_order_id,'duplicate',true); end if;
  if p_order->>'channel' not in ('ifood','99food') and length(v_phone)>=10 then
    insert into public.customers(name,phone) values(p_order->>'customerName',v_phone) on conflict(phone) do update set name=excluded.name,updated_at=now() returning id into v_customer_id;
  end if;
  insert into public.orders(id,number,channel,status,payment_status,customer_id,customer_name,customer_phone,address,table_number,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,payment_method,change_for_cents,notes,coupon_code,source_idempotency_key,driver_id,created_at,updated_at)
  values(v_order_id,(p_order->>'number')::bigint,(p_order->>'channel')::public.order_channel,(p_order->>'status')::public.order_status,(p_order->>'paymentStatus')::public.payment_status,v_customer_id,p_order->>'customerName',v_phone,p_order->'address',nullif(p_order->>'tableNumber','')::integer,(p_order->>'subtotal')::integer,(p_order->>'discount')::integer,(p_order->>'deliveryFee')::integer,(p_order->>'total')::integer,(p_order->>'paymentMethod')::public.payment_method,nullif(p_order->>'changeFor','')::integer,p_order->>'notes',nullif(p_order->>'couponCode',''),p_order->>'sourceIdempotencyKey',nullif(p_order->>'driverId','')::uuid,coalesce((p_order->>'createdAt')::timestamptz,now()),coalesce((p_order->>'updatedAt')::timestamptz,now()));
  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    if coalesce(v_item->'selection','{}'::jsonb) ?| array['border','borda','borderId','bordaId'] then raise exception 'Bordas não existem neste sistema'; end if;
    if v_item->>'kind'='reward' and auth.uid() is null then raise exception 'Recompensa exige autorização interna'; end if;
    if v_item->'selection'->>'size'='broto' and coalesce(v_item->'selection'->>'flavorB','')<>'' then raise exception 'Pizza Broto aceita somente um sabor'; end if;
    insert into public.order_items(id,order_id,kind,name_snapshot,quantity,unit_price_cents,product_id,selection,sector)
    values(v_item->>'id',v_order_id,v_item->>'kind',v_item->>'name',(v_item->>'quantity')::integer,(v_item->>'unitPrice')::integer,v_item->>'productId',v_item->'selection',case when v_item->>'kind'='product' then 'bar' else 'kitchen' end);
  end loop;
  perform public.decrement_order_stock(v_order_id);
  insert into public.order_status_history(order_id,to_status,source) values(v_order_id,(p_order->>'status')::public.order_status,'create_order');
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data) values(auth.uid(),coalesce((select display_name from public.profiles where id=auth.uid()),'Sistema'),'ORDER_CREATED','order',v_order_id,p_order);
  return jsonb_build_object('id',v_order_id,'duplicate',false);
end $$;

grant execute on function public.create_order_transaction(jsonb) to service_role;

create or replace function public.finish_delivery_cleanup() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='completed' and old.status is distinct from 'completed' and new.driver_id is not null then
    update public.drivers set available=true,active_order_id=null,updated_at=now() where id=new.driver_id;
    update public.tracking_tokens set revoked_at=now() where order_id=new.id and revoked_at is null;
  end if;
  return new;
end $$;
create trigger delivery_cleanup after update of status on public.orders for each row execute function public.finish_delivery_cleanup();

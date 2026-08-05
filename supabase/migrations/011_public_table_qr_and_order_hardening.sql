-- Public QR-table flow and final hardening of atomic order creation.
-- A QR order either reuses an open tab known by the customer device or opens a new participant tab atomically.

create or replace function public.apply_order_coupon_and_stock() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_coupon public.coupons%rowtype; v_actor uuid:=nullif(current_setting('app.actor_id',true),'')::uuid;
begin
  if new.coupon_code is not null and new.coupon_code<>'' then
    select * into v_coupon from public.coupons where code=new.coupon_code for update;
    if not found
      or not v_coupon.active
      or (v_coupon.starts_at is not null and v_coupon.starts_at>now())
      or (v_coupon.ends_at is not null and v_coupon.ends_at<now())
      or (v_coupon.total_limit is not null and v_coupon.uses>=v_coupon.total_limit)
      or not (new.channel=any(v_coupon.channels))
      or (v_coupon.minimum_cents is not null and new.subtotal_cents<v_coupon.minimum_cents)
    then raise exception 'Cupom inválido ou esgotado'; end if;
    update public.coupons set uses=uses+1,updated_at=now() where id=v_coupon.id;
    insert into public.coupon_redemptions(coupon_id,order_id,discount_cents) values(v_coupon.id,new.id,new.discount_cents);
  elsif new.discount_cents>0 and auth.uid() is null and v_actor is null then
    raise exception 'Desconto sem cupom não autorizado';
  end if;
  return new;
end $$;

create or replace function public.create_order_transaction(p_order jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_order_id text:=p_order->>'id';
  v_existing_id text;
  v_item jsonb;
  v_customer_id uuid;
  v_phone text:=coalesce(p_order->>'customerPhone','');
  v_actor uuid:=nullif(current_setting('app.actor_id',true),'')::uuid;
  v_channel text:=p_order->>'channel';
  v_table_number integer:=nullif(p_order->>'tableNumber','')::integer;
  v_tab_id uuid;
  v_existing_tab uuid;
begin
  select id,tab_id into v_existing_id,v_existing_tab from public.orders where source_idempotency_key=p_order->>'sourceIdempotencyKey';
  if found then return jsonb_build_object('id',v_existing_id,'tabId',v_existing_tab,'duplicate',true); end if;

  if v_channel='table_qr' then
    if v_table_number is null or v_table_number not between 1 and 15 then raise exception 'Mesa inválida para pedido pelo QR Code'; end if;
    perform 1 from public.restaurant_tables where number=v_table_number for update;
    if not found then raise exception 'Mesa não cadastrada'; end if;
    if coalesce(p_order->>'tabId','')<>'' then
      select id into v_tab_id from public.tabs
      where id=(p_order->>'tabId')::uuid and table_number=v_table_number and status in ('open','partial') for update;
      if not found then raise exception 'Comanda da mesa não está mais aberta'; end if;
    else
      if length(trim(coalesce(p_order->>'tabName','')))<2 then raise exception 'Nome da comanda ou participante obrigatório'; end if;
      select public.open_table_tab(v_table_number,trim(p_order->>'tabName'),1,null) into v_tab_id;
    end if;
  elsif v_channel='dine_in' then
    if v_table_number is null or coalesce(p_order->>'tabId','')='' then raise exception 'Pedido de salão exige mesa e comanda'; end if;
    select id into v_tab_id from public.tabs
    where id=(p_order->>'tabId')::uuid and table_number=v_table_number and status in ('open','partial') for update;
    if not found then raise exception 'Comanda de salão não está aberta'; end if;
  else
    v_tab_id:=nullif(p_order->>'tabId','')::uuid;
  end if;

  if v_channel not in ('ifood','99food','table_qr') and length(v_phone)>=10 then
    insert into public.customers(name,phone) values(p_order->>'customerName',v_phone)
    on conflict(phone) do update set name=excluded.name,updated_at=now() returning id into v_customer_id;
  end if;

  insert into public.orders(
    id,number,channel,status,payment_status,customer_id,customer_name,customer_phone,address,
    table_number,tab_id,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,payment_method,
    change_for_cents,notes,coupon_code,source_idempotency_key,driver_id,created_by,created_at,updated_at
  ) values(
    v_order_id,(p_order->>'number')::bigint,v_channel::public.order_channel,
    (p_order->>'status')::public.order_status,(p_order->>'paymentStatus')::public.payment_status,
    v_customer_id,p_order->>'customerName',v_phone,p_order->'address',v_table_number,v_tab_id,
    (p_order->>'subtotal')::integer,(p_order->>'discount')::integer,(p_order->>'deliveryFee')::integer,
    (p_order->>'total')::integer,(p_order->>'paymentMethod')::public.payment_method,
    nullif(p_order->>'changeFor','')::integer,p_order->>'notes',nullif(p_order->>'couponCode',''),
    p_order->>'sourceIdempotencyKey',nullif(p_order->>'driverId','')::uuid,v_actor,
    coalesce((p_order->>'createdAt')::timestamptz,now()),coalesce((p_order->>'updatedAt')::timestamptz,now())
  );

  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    if coalesce(v_item->'selection','{}'::jsonb) ?| array['border','borda','borderId','bordaId'] then raise exception 'Bordas não existem neste sistema'; end if;
    if v_item->>'kind'='reward' and coalesce(current_setting('app.reward_authorized',true),'')<>'true' then raise exception 'Recompensa exige autorização interna'; end if;
    if v_item->'selection'->>'size'='broto' and coalesce(v_item->'selection'->>'flavorB','')<>'' then raise exception 'Pizza Broto aceita somente um sabor'; end if;
    insert into public.order_items(id,order_id,kind,name_snapshot,quantity,unit_price_cents,product_id,selection,sector)
    values(v_item->>'id',v_order_id,v_item->>'kind',v_item->>'name',(v_item->>'quantity')::integer,(v_item->>'unitPrice')::integer,v_item->>'productId',v_item->'selection',case when v_item->>'kind'='product' then 'bar' else 'kitchen' end);
  end loop;

  perform public.decrement_order_stock(v_order_id);
  insert into public.order_status_history(order_id,to_status,actor_id,source)
  values(v_order_id,(p_order->>'status')::public.order_status,v_actor,case when v_channel='table_qr' then 'table_qr' else 'create_order' end);
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(v_actor,coalesce((select display_name from public.profiles where id=v_actor),case when v_channel='table_qr' then 'Cliente QR' else 'Sistema' end),'ORDER_CREATED','order',v_order_id,p_order||jsonb_build_object('resolvedTabId',v_tab_id));
  return jsonb_build_object('id',v_order_id,'tabId',v_tab_id,'duplicate',false);
end $$;

grant execute on function public.create_order_transaction(jsonb) to service_role;

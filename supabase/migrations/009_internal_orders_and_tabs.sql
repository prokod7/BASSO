-- Internal order flow, authorized discounts/payments, and salon/comanda transactions.
create or replace function public.create_order_transaction(p_order jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_order_id text := p_order->>'id';
  v_item jsonb;
  v_customer_id uuid;
  v_phone text := coalesce(p_order->>'customerPhone','');
  v_actor uuid := nullif(current_setting('app.actor_id',true),'')::uuid;
begin
  if exists(select 1 from public.orders where source_idempotency_key=p_order->>'sourceIdempotencyKey') then return jsonb_build_object('id',v_order_id,'duplicate',true); end if;
  if p_order->>'channel' not in ('ifood','99food') and length(v_phone)>=10 then
    insert into public.customers(name,phone) values(p_order->>'customerName',v_phone)
    on conflict(phone) do update set name=excluded.name,updated_at=now() returning id into v_customer_id;
  end if;
  insert into public.orders(id,number,channel,status,payment_status,customer_id,customer_name,customer_phone,address,table_number,tab_id,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,payment_method,change_for_cents,notes,coupon_code,source_idempotency_key,driver_id,created_by,created_at,updated_at)
  values(v_order_id,(p_order->>'number')::bigint,(p_order->>'channel')::public.order_channel,(p_order->>'status')::public.order_status,(p_order->>'paymentStatus')::public.payment_status,v_customer_id,p_order->>'customerName',v_phone,p_order->'address',nullif(p_order->>'tableNumber','')::integer,nullif(p_order->>'tabId','')::uuid,(p_order->>'subtotal')::integer,(p_order->>'discount')::integer,(p_order->>'deliveryFee')::integer,(p_order->>'total')::integer,(p_order->>'paymentMethod')::public.payment_method,nullif(p_order->>'changeFor','')::integer,p_order->>'notes',nullif(p_order->>'couponCode',''),p_order->>'sourceIdempotencyKey',nullif(p_order->>'driverId','')::uuid,v_actor,coalesce((p_order->>'createdAt')::timestamptz,now()),coalesce((p_order->>'updatedAt')::timestamptz,now()));
  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    if coalesce(v_item->'selection','{}'::jsonb) ?| array['border','borda','borderId','bordaId'] then raise exception 'Bordas não existem neste sistema'; end if;
    if v_item->>'kind'='reward' and coalesce(current_setting('app.reward_authorized',true),'')<>'true' then raise exception 'Recompensa exige autorização interna'; end if;
    if v_item->'selection'->>'size'='broto' and coalesce(v_item->'selection'->>'flavorB','')<>'' then raise exception 'Pizza Broto aceita somente um sabor'; end if;
    insert into public.order_items(id,order_id,kind,name_snapshot,quantity,unit_price_cents,product_id,selection,sector)
    values(v_item->>'id',v_order_id,v_item->>'kind',v_item->>'name',(v_item->>'quantity')::integer,(v_item->>'unitPrice')::integer,v_item->>'productId',v_item->'selection',case when v_item->>'kind'='product' then 'bar' else 'kitchen' end);
  end loop;
  perform public.decrement_order_stock(v_order_id);
  insert into public.order_status_history(order_id,to_status,actor_id,source) values(v_order_id,(p_order->>'status')::public.order_status,v_actor,'create_order');
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(v_actor,coalesce((select display_name from public.profiles where id=v_actor),'Sistema'),'ORDER_CREATED','order',v_order_id,p_order);
  return jsonb_build_object('id',v_order_id,'duplicate',false);
end $$;

grant execute on function public.create_order_transaction(jsonb) to service_role;

create or replace function public.create_internal_order_transaction(
  p_order jsonb,
  p_reward_token text,
  p_actor_id uuid,
  p_discount_reason text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_payment_id uuid; v_session_id uuid; v_has_reward boolean;
begin
  perform set_config('app.actor_id',coalesce(p_actor_id::text,''),true);
  select exists(select 1 from jsonb_array_elements(p_order->'items') where value->>'kind'='reward') into v_has_reward;
  if (p_order->>'channel') in ('ifood','99food','table_qr') then raise exception 'Canal não permitido para lançamento interno'; end if;
  if (p_order->>'discount')::integer > 0 and length(trim(coalesce(p_discount_reason,'')))<2 then raise exception 'Motivo obrigatório para desconto manual'; end if;
  if v_has_reward then
    if coalesce(p_reward_token,'')='' then raise exception 'Token da recompensa obrigatório'; end if;
    v_result:=public.consume_order_with_reward_transaction(p_order,p_reward_token);
  else
    v_result:=public.create_order_transaction(p_order);
  end if;
  update public.orders set created_by=p_actor_id where id=p_order->>'id';
  if p_order->>'paymentStatus'='paid' and (p_order->>'total')::integer>0 then
    insert into public.payments(order_id,method,status,amount_cents,idempotency_key,created_by)
    values(p_order->>'id',(p_order->>'paymentMethod')::public.payment_method,'paid',(p_order->>'total')::integer,(p_order->>'sourceIdempotencyKey')||':payment',p_actor_id)
    on conflict(idempotency_key) do nothing returning id into v_payment_id;
    if p_order->>'paymentMethod'='cash' and v_payment_id is not null then
      select id into v_session_id from public.cash_sessions where status='open' order by opened_at desc limit 1 for update;
      if v_session_id is not null then
        insert into public.cash_movements(session_id,kind,amount_cents,reason,payment_id,created_by)
        values(v_session_id,'sale',(p_order->>'total')::integer,'Venda interna '||(p_order->>'id'),v_payment_id,p_actor_id);
      end if;
    end if;
  end if;
  if (p_order->>'discount')::integer>0 then
    insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,after_data)
    values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'MANUAL_DISCOUNT_APPLIED','order',p_order->>'id',p_discount_reason,jsonb_build_object('discountCents',(p_order->>'discount')::integer));
  end if;
  return v_result;
end $$;

grant execute on function public.create_internal_order_transaction(jsonb,text,uuid,text) to service_role;

create or replace function public.open_table_tab(
  p_table_number integer,
  p_name text,
  p_people_count integer,
  p_actor_id uuid default auth.uid()
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_table_number<1 or p_table_number>15 then raise exception 'Mesa inválida'; end if;
  if length(trim(p_name))<1 then raise exception 'Nome da comanda obrigatório'; end if;
  update public.restaurant_tables set status='occupied',people_count=coalesce(p_people_count,people_count),opened_at=coalesce(opened_at,now()),opened_by=coalesce(opened_by,p_actor_id),version=version+1,updated_at=now() where number=p_table_number;
  insert into public.tabs(table_number,name,waiter_id) values(p_table_number,p_name,p_actor_id) returning id into v_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'TAB_OPENED','tab',v_id::text,jsonb_build_object('tableNumber',p_table_number,'name',p_name));
  return v_id;
end $$;

grant execute on function public.open_table_tab(integer,text,integer,uuid) to authenticated,service_role;

create or replace function public.transfer_tab(
  p_tab_id uuid,
  p_target_table integer,
  p_actor_id uuid default auth.uid()
) returns void
language plpgsql security definer set search_path=public as $$
declare v_tab public.tabs%rowtype; v_open_count integer;
begin
  select * into v_tab from public.tabs where id=p_tab_id and status in ('open','partial') for update;
  if not found then raise exception 'Comanda aberta não encontrada'; end if;
  if p_target_table<1 or p_target_table>15 then raise exception 'Mesa de destino inválida'; end if;
  update public.tabs set table_number=p_target_table,version=version+1,updated_at=now() where id=p_tab_id;
  update public.orders set table_number=p_target_table,updated_at=now() where tab_id=p_tab_id and status<>'completed';
  update public.restaurant_tables set status='occupied',opened_at=coalesce(opened_at,now()),version=version+1,updated_at=now() where number=p_target_table;
  select count(*) into v_open_count from public.tabs where table_number=v_tab.table_number and status in ('open','partial');
  if v_open_count=0 then update public.restaurant_tables set status='free',people_count=null,opened_at=null,opened_by=null,group_id=null,version=version+1,updated_at=now() where number=v_tab.table_number; end if;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'TAB_TRANSFERRED','tab',p_tab_id::text,jsonb_build_object('tableNumber',v_tab.table_number),jsonb_build_object('tableNumber',p_target_table));
end $$;

grant execute on function public.transfer_tab(uuid,integer,uuid) to authenticated,service_role;

create or replace function public.record_tab_payment(
  p_tab_id uuid,
  p_amount_cents integer,
  p_method public.payment_method,
  p_idempotency_key text,
  p_actor_id uuid default auth.uid()
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_tab public.tabs%rowtype; v_total integer; v_payment_id uuid; v_new_paid integer;
begin
  if p_amount_cents<=0 then raise exception 'Valor inválido'; end if;
  select * into v_tab from public.tabs where id=p_tab_id and status in ('open','partial') for update;
  if not found then raise exception 'Comanda não encontrada'; end if;
  select coalesce(sum(o.total_cents),0) into v_total from public.orders o where o.tab_id=p_tab_id and o.status<>'cancelled';
  if v_tab.paid_cents+p_amount_cents>v_total then raise exception 'Pagamento excede o saldo da comanda'; end if;
  insert into public.payments(tab_id,method,status,amount_cents,idempotency_key,created_by)
  values(p_tab_id,p_method,'paid',p_amount_cents,p_idempotency_key,p_actor_id) returning id into v_payment_id;
  v_new_paid:=v_tab.paid_cents+p_amount_cents;
  update public.tabs set paid_cents=v_new_paid,status=case when v_new_paid>=v_total then 'closed' else 'partial' end,closed_at=case when v_new_paid>=v_total then now() else null end,version=version+1,updated_at=now() where id=p_tab_id;
  if v_new_paid>=v_total then
    update public.orders set payment_status='paid',status='completed',completed_at=now(),updated_at=now() where tab_id=p_tab_id and status<>'cancelled';
  else
    update public.orders set payment_status='partial',updated_at=now() where tab_id=p_tab_id and status<>'cancelled';
  end if;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'TAB_PAYMENT_RECORDED','tab',p_tab_id::text,jsonb_build_object('amountCents',p_amount_cents,'method',p_method,'paidCents',v_new_paid,'totalCents',v_total));
  return jsonb_build_object('paidCents',v_new_paid,'totalCents',v_total,'closed',v_new_paid>=v_total,'paymentId',v_payment_id);
end $$;

grant execute on function public.record_tab_payment(uuid,integer,public.payment_method,text,uuid) to authenticated,service_role;

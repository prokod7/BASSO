CREATE OR REPLACE FUNCTION public.change_order_status_controlled(p_order_id text, p_status order_status, p_reason text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old public.order_status;
  v_channel public.order_channel;
  v_customer uuid;
  v_payment public.payment_status;
  v_balance integer;
  v_old_rank integer;
  v_new_rank integer;
begin
  select status,channel,customer_id,payment_status
    into v_old,v_channel,v_customer,v_payment
    from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if p_status=v_old then return; end if;
  if p_status='out_for_delivery' and v_channel not in ('own_delivery','ifood','99food') then
    raise exception 'Status não permitido para o canal';
  end if;
  if p_status='completed' and v_payment<>'paid' then
    raise exception 'Confirme o recebimento integral antes de concluir o pedido';
  end if;

  v_old_rank:=case v_old when 'received' then 1 when 'confirmed' then 2 when 'preparing' then 3 when 'ready' then 4 when 'out_for_delivery' then 5 when 'completed' then 6 else 7 end;
  v_new_rank:=case p_status when 'received' then 1 when 'confirmed' then 2 when 'preparing' then 3 when 'ready' then 4 when 'out_for_delivery' then 5 when 'completed' then 6 else 7 end;
  if (p_status='cancelled' or v_new_rank<v_old_rank or v_new_rank>v_old_rank+1) and coalesce(trim(p_reason),'')='' then
    raise exception 'Motivo obrigatório para cancelar, retornar ou saltar etapas';
  end if;

  update public.orders
     set status=p_status,
         updated_at=now(),
         updated_by=p_actor_id,
         version=version+1,
         completed_at=case when p_status='completed' then now() when v_old='completed' then null else completed_at end
   where id=p_order_id;

  insert into public.order_status_history(order_id,from_status,to_status,reason,actor_id,source)
  values(p_order_id,v_old,p_status,p_reason,p_actor_id,'operation');
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'ORDER_STATUS_CHANGED','order',p_order_id,p_reason,jsonb_build_object('status',v_old),jsonb_build_object('status',p_status));

  if p_status in ('completed','cancelled') then
    update public.drivers set available=true,active_order_id=null,updated_at=now() where active_order_id=p_order_id;
    update public.tracking_tokens set revoked_at=coalesce(revoked_at,now()) where order_id=p_order_id;
  end if;

  if p_status='completed' and v_old<>'completed' and v_channel='own_delivery' and v_payment='paid' and v_customer is not null then
    insert into public.loyalty_accounts(customer_id) values(v_customer) on conflict do nothing;
    select balance into v_balance from public.loyalty_accounts where customer_id=v_customer for update;
    if not exists(select 1 from public.loyalty_ledger where order_id=p_order_id and reason='eligible_order') then
      v_balance:=least(15,v_balance+1);
      update public.loyalty_accounts set balance=v_balance,lifetime_points=lifetime_points+1,updated_at=now() where customer_id=v_customer;
      insert into public.loyalty_ledger(customer_id,order_id,delta,reason,balance_after,created_by)
      values(v_customer,p_order_id,1,'eligible_order',v_balance,p_actor_id);
    end if;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.close_cash_session(p_declared_cents integer, p_notes text, p_actor_id uuid DEFAULT auth.uid())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_session public.cash_sessions%rowtype; v_expected integer; v_id uuid;
begin
  select * into v_session from public.cash_sessions where status='open' order by opened_at desc limit 1 for update;
  if not found then raise exception 'Não existe caixa aberto'; end if;
  select v_session.initial_cents+coalesce(sum(amount_cents),0) into v_expected from public.cash_movements where session_id=v_session.id;
  update public.cash_sessions set status='closed',closed_by=p_actor_id,closed_at=now(),declared_cents=p_declared_cents,expected_cents=v_expected,difference_cents=p_declared_cents-v_expected,notes=p_notes where id=v_session.id returning id into v_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data) values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'CASH_CLOSED','cash_session',v_id::text,p_notes,to_jsonb(v_session),jsonb_build_object('declaredCents',p_declared_cents,'expectedCents',v_expected,'differenceCents',p_declared_cents-v_expected));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.create_internal_order_transaction(p_order jsonb, p_reward_token text, p_actor_id uuid, p_discount_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.create_order_transaction(p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_id text:=p_order->>'id'; v_item jsonb; v_customer_id uuid; v_phone text:=coalesce(p_order->>'customerPhone',''); v_actor uuid:=nullif(current_setting('app.actor_id',true),'')::uuid;
begin
  if exists(select 1 from public.orders where source_idempotency_key=p_order->>'sourceIdempotencyKey') then return jsonb_build_object('id',(select id from public.orders where source_idempotency_key=p_order->>'sourceIdempotencyKey'),'duplicate',true); end if;
  if coalesce(p_order->>'customerId','')<>'' and p_order->>'channel' not in ('ifood','99food') then
    select id into v_customer_id from public.customers where id=(p_order->>'customerId')::uuid and active;
    if v_customer_id is null then raise exception 'Cliente selecionado não existe ou está inativo'; end if;
    update public.customers set name=p_order->>'customerName',updated_at=now() where id=v_customer_id;
  elsif p_order->>'channel' not in ('ifood','99food') and length(v_phone)>=10 then
    insert into public.customers(name,phone) values(p_order->>'customerName',v_phone) on conflict(phone) do update set name=excluded.name,updated_at=now() returning id into v_customer_id;
  end if;
  insert into public.orders(id,number,channel,status,payment_status,customer_id,customer_name,customer_phone,address,table_number,tab_id,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,payment_method,change_for_cents,notes,coupon_code,source_idempotency_key,driver_id,created_by,created_at,updated_at,order_origin)
  values(v_order_id,1,(p_order->>'channel')::public.order_channel,(p_order->>'status')::public.order_status,(p_order->>'paymentStatus')::public.payment_status,v_customer_id,p_order->>'customerName',v_phone,p_order->'address',nullif(p_order->>'tableNumber','')::integer,nullif(p_order->>'tabId','')::uuid,(p_order->>'subtotal')::integer,(p_order->>'discount')::integer,(p_order->>'deliveryFee')::integer,(p_order->>'total')::integer,(p_order->>'paymentMethod')::public.payment_method,nullif(p_order->>'changeFor','')::integer,p_order->>'notes',nullif(p_order->>'couponCode',''),p_order->>'sourceIdempotencyKey',nullif(p_order->>'driverId','')::uuid,v_actor,coalesce((p_order->>'createdAt')::timestamptz,now()),coalesce((p_order->>'updatedAt')::timestamptz,now()),coalesce(nullif(p_order->>'origin',''),case when p_order->>'channel' in ('ifood','99food') then 'marketplace' when p_order->>'channel' in ('dine_in','table_qr') then 'table' else 'web' end));
  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    if coalesce(v_item->'selection','{}'::jsonb) ?| array['border','borda','borderId','bordaId'] then raise exception 'Bordas não existem neste sistema'; end if;
    if v_item->'selection'->>'size'='broto' and coalesce(v_item->'selection'->>'flavorB','')<>'' then raise exception 'Pizza Broto aceita somente um sabor'; end if;
    insert into public.order_items(id,order_id,kind,name_snapshot,quantity,unit_price_cents,product_id,selection,sector)
    values(v_item->>'id',v_order_id,v_item->>'kind',v_item->>'name',(v_item->>'quantity')::integer,(v_item->>'unitPrice')::integer,v_item->>'productId',v_item->'selection',case when v_item->>'kind'='product' then 'bar' else 'kitchen' end);
  end loop;
  perform public.decrement_order_stock(v_order_id);
  insert into public.order_status_history(order_id,to_status,actor_id,source) values(v_order_id,(p_order->>'status')::public.order_status,v_actor,'create_order');
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data) values(v_actor,coalesce((select display_name from public.profiles where id=v_actor),'Sistema'),'ORDER_CREATED','order',v_order_id,p_order);
  return jsonb_build_object('id',v_order_id,'duplicate',false);
end $function$;

CREATE OR REPLACE FUNCTION public.decrement_order_stock(p_order_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.enqueue_order_print_jobs(p_order_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
  v_sector text;
  v_payload jsonb;
  v_printer_key text;
begin
  if not exists(select 1 from public.orders where id=p_order_id) then
    raise exception 'Pedido não encontrado';
  end if;
  for v_sector in select distinct i.sector from public.order_items i where i.order_id=p_order_id and i.production_status<>'cancelled' loop
    v_printer_key := case when v_sector='bar' then 'bar' when v_sector='counter' then 'counter' else 'cozinha' end;
    if exists (select 1 from public.print_profiles p where p.active and p.auto_print and ((v_sector='kitchen' and p.sector='kitchen') or (v_sector='bar' and p.sector='bar') or (v_sector='counter' and p.sector='counter'))) then
      select jsonb_build_object('order',(select to_jsonb(o) from public.orders o where o.id=p_order_id),'items',coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb)) into v_payload from public.order_items i where i.order_id=p_order_id and i.sector=v_sector and i.production_status<>'cancelled';
      insert into public.print_jobs(order_id,sector,printer_key,payload) select p_order_id,v_sector,v_printer_key,v_payload where not exists(select 1 from public.print_jobs j where j.order_id=p_order_id and j.sector=v_sector and not j.is_reprint);
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;
  if exists (select 1 from public.print_profiles p where p.active and p.auto_print and p.sector='counter') then
    select jsonb_build_object('order',(select to_jsonb(o) from public.orders o where o.id=p_order_id),'items',coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb)) into v_payload from public.order_items i where i.order_id=p_order_id and i.production_status<>'cancelled';
    insert into public.print_jobs(order_id,sector,printer_key,payload) select p_order_id,'counter','counter',v_payload where not exists(select 1 from public.print_jobs j where j.order_id=p_order_id and j.sector='counter' and not j.is_reprint);
    if found then v_count := v_count + 1; end if;
  end if;
  return v_count;
end $function$;

CREATE OR REPLACE FUNCTION public.manage_order_item_transaction(p_order_id text, p_item_id text, p_action text, p_value jsonb DEFAULT '{}'::jsonb, p_reason text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_before public.order_items%rowtype; v_after public.order_items%rowtype; v_totals jsonb; v_qty integer; v_notes text;
begin
  select * into v_before from public.order_items where id=p_item_id and order_id=p_order_id for update;
  if not found then raise exception 'Item não encontrado'; end if;
  if p_action in ('quantity','cancel','restore') and coalesce(trim(p_reason),'')='' then raise exception 'Motivo obrigatório'; end if;

  if p_action='quantity' then
    v_qty:=(p_value->>'quantity')::integer;
    if v_qty < 1 or v_qty > 99 then raise exception 'Quantidade inválida'; end if;
    update public.order_items set quantity=v_qty,updated_at=now(),updated_by=p_actor_id where id=p_item_id;
  elsif p_action='notes' then
    v_notes:=coalesce(p_value->>'notes','');
    if char_length(v_notes)>500 then raise exception 'Observação excede 500 caracteres'; end if;
    update public.order_items set selection=jsonb_set(coalesce(selection,'{}'::jsonb),'{notes}',to_jsonb(v_notes),true),updated_at=now(),updated_by=p_actor_id where id=p_item_id;
  elsif p_action='cancel' then
    update public.order_items set production_status='cancelled',cancelled_reason=p_reason,updated_at=now(),updated_by=p_actor_id where id=p_item_id;
  elsif p_action='restore' then
    update public.order_items set production_status='queued',cancelled_reason=null,updated_at=now(),updated_by=p_actor_id where id=p_item_id;
  elsif p_action='production_status' then
    if coalesce(p_value->>'status','') not in ('queued','preparing','ready','cancelled') then raise exception 'Status de produção inválido'; end if;
    update public.order_items set production_status=(p_value->>'status'),updated_at=now(),updated_by=p_actor_id where id=p_item_id;
  else
    raise exception 'Ação de item inválida';
  end if;

  select * into v_after from public.order_items where id=p_item_id;
  v_totals:=public.recalculate_order_totals(p_order_id);
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'ORDER_ITEM_'||upper(p_action),'order_item',p_item_id,p_reason,to_jsonb(v_before),to_jsonb(v_after));
  return jsonb_build_object('item',to_jsonb(v_after),'totals',v_totals);
end $function$;

CREATE OR REPLACE FUNCTION public.open_cash_session(p_initial_cents integer, p_actor_id uuid DEFAULT auth.uid())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if exists(select 1 from public.cash_sessions where status='open') then raise exception 'Já existe um caixa aberto'; end if;
  insert into public.cash_sessions(opened_by,initial_cents) values(p_actor_id,p_initial_cents) returning id into v_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data) values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'CASH_OPENED','cash_session',v_id::text,jsonb_build_object('initialCents',p_initial_cents));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.recalculate_order_totals(p_order_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_subtotal integer; v_discount integer; v_fee integer; v_total integer;
begin
  select coalesce(sum(quantity * unit_price_cents) filter (where production_status <> 'cancelled'),0)
    into v_subtotal from public.order_items where order_id=p_order_id;
  select discount_cents,delivery_fee_cents into v_discount,v_fee from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  v_discount:=least(coalesce(v_discount,0),v_subtotal);
  v_total:=greatest(0,v_subtotal-v_discount+coalesce(v_fee,0));
  update public.orders set subtotal_cents=v_subtotal,discount_cents=v_discount,total_cents=v_total,
    version=version+1,updated_at=now() where id=p_order_id;
  return jsonb_build_object('subtotal',v_subtotal,'discount',v_discount,'deliveryFee',v_fee,'total',v_total);
end $function$;

CREATE OR REPLACE FUNCTION public.record_cash_movement(p_kind text, p_amount_cents integer, p_reason text, p_actor_id uuid DEFAULT auth.uid())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_session public.cash_sessions%rowtype; v_signed integer; v_id uuid; v_available bigint;
begin
  if p_kind not in ('supply','withdrawal','adjustment') then raise exception 'Tipo de movimentação inválido'; end if;
  if p_amount_cents <= 0 then raise exception 'Valor deve ser positivo'; end if;
  if length(trim(p_reason)) < 2 then raise exception 'Motivo obrigatório'; end if;
  select * into v_session from public.cash_sessions where status='open' order by opened_at desc limit 1 for update;
  if not found then raise exception 'Não existe caixa aberto'; end if;
  select v_session.initial_cents + coalesce(sum(amount_cents),0) into v_available from public.cash_movements where session_id=v_session.id;
  if p_kind='withdrawal' and p_amount_cents>v_available then raise exception 'Sangria excede o dinheiro esperado disponível no caixa'; end if;
  v_signed := case when p_kind='withdrawal' then -p_amount_cents else p_amount_cents end;
  insert into public.cash_movements(session_id,kind,amount_cents,reason,created_by)
  values(v_session.id,p_kind,v_signed,p_reason,p_actor_id) returning id into v_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'CASH_MOVEMENT_CREATED','cash_movement',v_id::text,p_reason,jsonb_build_object('kind',p_kind,'amountCents',v_signed,'sessionId',v_session.id,'availableBeforeCents',v_available));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.record_order_payment_transaction(p_order_id text, p_method payment_method, p_amount integer, p_idempotency_key text, p_actor_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_payment_id uuid;
  v_paid integer;
  v_new_status public.payment_status;
  v_session uuid;
  v_balance integer;
begin
  if p_amount <= 0 then raise exception 'Valor inválido'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;

  select id into v_payment_id from public.payments where idempotency_key = p_idempotency_key;
  if v_payment_id is not null then
    select coalesce(sum(amount_cents),0) into v_paid
      from public.payments where order_id = p_order_id and status = 'paid';
    return jsonb_build_object(
      'paymentId', v_payment_id,
      'paidAmount', v_paid,
      'paymentStatus', v_order.payment_status,
      'duplicate', true
    );
  end if;

  select coalesce(sum(amount_cents),0) into v_paid
    from public.payments where order_id = p_order_id and status = 'paid';
  v_balance := greatest(0, v_order.total_cents - v_paid);
  if v_balance <= 0 then raise exception 'Pedido já está integralmente pago'; end if;
  if p_amount > v_balance then raise exception 'Pagamento excede o saldo pendente do pedido'; end if;

  insert into public.payments(order_id, method, status, amount_cents, provider, idempotency_key, metadata, created_by)
  values(p_order_id, p_method, 'paid', p_amount, 'manual', p_idempotency_key, p_metadata, p_actor_id)
  returning id into v_payment_id;

  v_paid := v_paid + p_amount;
  v_new_status := case
    when v_paid >= v_order.total_cents then 'paid'::public.payment_status
    else 'partial'::public.payment_status
  end;

  update public.orders
  set payment_status = v_new_status,
      change_for_cents = case
        when p_method = 'cash' and nullif(p_metadata->>'changeFor','') is not null
          then greatest(v_order.total_cents, (p_metadata->>'changeFor')::integer)
        else change_for_cents
      end,
      updated_at = now(),
      updated_by = p_actor_id,
      version = version + 1
  where id = p_order_id;

  if p_method = 'cash' then
    select id into v_session from public.cash_sessions
      where status = 'open' order by opened_at desc limit 1 for update;
    if v_session is null then raise exception 'Abra o caixa antes de receber em dinheiro'; end if;
    insert into public.cash_movements(session_id, kind, amount_cents, reason, payment_id, created_by)
    values(v_session, 'sale', p_amount, 'Recebimento do pedido #' || v_order.number, v_payment_id, p_actor_id);
  end if;

  insert into public.audit_logs(actor_id, actor_label, action, entity_type, entity_id, after_data)
  values(
    p_actor_id,
    coalesce((select display_name from public.profiles where id = p_actor_id), 'Sistema'),
    'ORDER_PAYMENT_RECORDED',
    'payment',
    v_payment_id::text,
    jsonb_build_object('orderId', p_order_id, 'method', p_method, 'amount', p_amount, 'paidAmount', v_paid)
  );

  return jsonb_build_object(
    'paymentId', v_payment_id,
    'paidAmount', v_paid,
    'paymentStatus', v_new_status,
    'duplicate', false
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.record_tab_payment(p_tab_id uuid, p_amount_cents integer, p_method payment_method, p_idempotency_key text, p_actor_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tab public.tabs%rowtype; v_consumption integer; v_service integer; v_total integer; v_payment_id uuid; v_new_paid integer; v_session_id uuid; v_open_count integer;
begin
  if p_amount_cents<=0 then raise exception 'Valor inválido'; end if;
  select * into v_tab from public.tabs where id=p_tab_id and status in ('open','partial') for update;
  if not found then raise exception 'Comanda não encontrada'; end if;
  select coalesce(sum(o.total_cents),0) into v_consumption from public.orders o where o.tab_id=p_tab_id and o.status<>'cancelled';
  if v_consumption<=0 then raise exception 'A comanda não possui consumo para receber'; end if;
  v_service:=case when v_tab.service_charge_applied then round(v_consumption*(v_tab.service_charge_rate_percent/100.0))::integer else 0 end;
  v_total:=v_consumption+v_service;
  if v_tab.paid_cents+p_amount_cents>v_total then raise exception 'Pagamento excede o saldo da comanda'; end if;
  insert into public.payments(tab_id,method,status,amount_cents,idempotency_key,created_by,metadata)
  values(p_tab_id,p_method,'paid',p_amount_cents,p_idempotency_key,p_actor_id,jsonb_build_object('serviceChargeApplied',v_tab.service_charge_applied,'serviceChargeCents',v_service))
  on conflict(idempotency_key) do nothing returning id into v_payment_id;
  if v_payment_id is null then return jsonb_build_object('paidCents',v_tab.paid_cents,'totalCents',v_total,'serviceChargeCents',v_service,'closed',v_tab.paid_cents>=v_total,'duplicate',true); end if;
  if p_method='cash' then
    select id into v_session_id from public.cash_sessions where status='open' order by opened_at desc limit 1 for update;
    if v_session_id is null then raise exception 'Abra o caixa antes de receber em dinheiro'; end if;
    insert into public.cash_movements(session_id,kind,amount_cents,reason,payment_id,created_by) values(v_session_id,'sale',p_amount_cents,'Pagamento da comanda '||p_tab_id::text,v_payment_id,p_actor_id);
  end if;
  v_new_paid:=v_tab.paid_cents+p_amount_cents;
  update public.tabs set paid_cents=v_new_paid,service_charge_cents=v_service,status=case when v_new_paid>=v_total then 'closed' else 'partial' end,closed_at=case when v_new_paid>=v_total then now() else null end,version=version+1,updated_at=now() where id=p_tab_id;
  if v_new_paid>=v_total then
    update public.orders set payment_status='paid',status='completed',completed_at=now(),updated_at=now() where tab_id=p_tab_id and status<>'cancelled';
    select count(*) into v_open_count from public.tabs where table_number=v_tab.table_number and status in ('open','partial');
    if v_open_count=0 then update public.restaurant_tables set status='free',people_count=null,opened_at=null,opened_by=null,group_id=null,version=version+1,updated_at=now() where number=v_tab.table_number; end if;
  else
    update public.orders set payment_status='partial',updated_at=now() where tab_id=p_tab_id and status<>'cancelled';
    update public.restaurant_tables set status='partial',version=version+1,updated_at=now() where number=v_tab.table_number;
  end if;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'TAB_PAYMENT_RECORDED','tab',p_tab_id::text,jsonb_build_object('amountCents',p_amount_cents,'method',p_method,'paidCents',v_new_paid,'consumptionCents',v_consumption,'serviceChargeCents',v_service,'totalCents',v_total));
  return jsonb_build_object('paidCents',v_new_paid,'totalCents',v_total,'serviceChargeCents',v_service,'closed',v_new_paid>=v_total,'paymentId',v_payment_id,'duplicate',false);
end $function$;

CREATE OR REPLACE FUNCTION public.set_tab_service_charge(p_tab_id uuid, p_applied boolean, p_actor_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tab public.tabs%rowtype; v_consumption integer; v_charge integer;
begin
  select * into v_tab from public.tabs where id=p_tab_id and status in ('open','partial') for update;
  if not found then raise exception 'Comanda aberta não encontrada'; end if;
  select coalesce(sum(total_cents),0) into v_consumption from public.orders where tab_id=p_tab_id and status<>'cancelled';
  v_charge:=case when p_applied then round(v_consumption*(v_tab.service_charge_rate_percent/100.0))::integer else 0 end;
  if v_tab.paid_cents>v_consumption+v_charge then raise exception 'Não é possível retirar a taxa após pagamentos que excedam o novo total'; end if;
  update public.tabs set service_charge_applied=p_applied,service_charge_cents=v_charge,updated_at=now(),version=version+1 where id=p_tab_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),case when p_applied then 'TAB_SERVICE_CHARGE_ENABLED' else 'TAB_SERVICE_CHARGE_REMOVED' end,'tab',p_tab_id::text,jsonb_build_object('ratePercent',v_tab.service_charge_rate_percent,'chargeCents',v_charge));
  return jsonb_build_object('applied',p_applied,'serviceChargeCents',v_charge,'consumptionCents',v_consumption,'totalCents',v_consumption+v_charge);
end $function$;

CREATE OR REPLACE FUNCTION public.transfer_tab(p_tab_id uuid, p_target_table integer, p_actor_id uuid DEFAULT auth.uid())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

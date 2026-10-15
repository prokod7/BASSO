-- Audit 14/10/2026: authorization, atomic accounting, stock and concurrency.
-- No historical orders, payments, balances or sequence values are rewritten.

-- Browser roles read tables via RLS; writes must go through authorized server RPCs.
drop policy if exists operational_tabs on public.tabs;
create policy operational_tabs_read on public.tabs for select to authenticated
using ((select private.can_manage_operation()));
drop policy if exists operational_tables on public.restaurant_tables;
create policy operational_tables_read on public.restaurant_tables for select to authenticated
using ((select private.can_manage_operation()));
revoke insert, update, delete, truncate, references, trigger on public.tabs, public.restaurant_tables from anon, authenticated;
grant select on public.tabs, public.restaurant_tables to authenticated;

-- A partial unique index is the final guarantee even for simultaneous INSERTs.
create unique index cash_sessions_single_open on public.cash_sessions ((status)) where status='open';
-- Migration 017 installed a second sequence consumer; retain the server-side trigger.
drop trigger if exists orders_assign_number on public.orders;

alter table public.print_jobs add column if not exists source_key text;
create unique index if not exists print_jobs_source_key on public.print_jobs(source_key) where source_key is not null;


create or replace function public.decrement_order_stock(p_order_id text) returns void
language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_stock public.inventory_items%rowtype;
  v_required numeric; v_applied numeric; v_delta numeric;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  for v_stock in
    select inv.* from public.inventory_items inv where inv.product_id in (
      select case when i.kind='product' then i.product_id when i.kind='combo' then i.selection->>'beverage' end
      from public.order_items i where i.order_id=p_order_id
    ) or inv.id in (select inventory_item_id from public.inventory_movements where order_id=p_order_id)
    order by inv.id for update
  loop
    select case when v_order.status='cancelled' then 0 else coalesce(sum(i.quantity),0) end
      into v_required from public.order_items i where i.order_id=p_order_id
      and i.production_status<>'cancelled'
      and (case when i.kind='product' then i.product_id when i.kind='combo' then i.selection->>'beverage' end)=v_stock.product_id;
    select coalesce(sum(delta),0) into v_applied from public.inventory_movements
      where order_id=p_order_id and inventory_item_id=v_stock.id and kind in ('sale','refund');
    v_delta := -v_required-v_applied;
    if v_delta=0 then continue; end if;
    if v_stock.quantity+v_delta<0 and not v_stock.allow_negative then raise exception 'Estoque insuficiente para %',v_stock.product_id; end if;
    update public.inventory_items set quantity=quantity+v_delta,version=version+1,updated_at=now() where id=v_stock.id;
    insert into public.inventory_movements(inventory_item_id,kind,delta,order_id,reason,created_by)
      values(v_stock.id,case when v_delta<0 then 'sale' else 'refund' end,v_delta,p_order_id,
        'Reconciliação transacional do consumo',v_order.updated_by);
  end loop;
end $$;

-- Serialise edits with tab payments before locking the order (one consistent lock order).
create or replace function public.lock_editable_order(p_order_id text, p_changes_consumption boolean default false)
returns public.orders language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_tab uuid; v_tab_paid integer;
begin
  select tab_id into v_tab from public.orders where id=p_order_id;
  if v_tab is not null then
    select paid_cents into v_tab_paid from public.tabs where id=v_tab for update;
  end if;
  select * into v_order from public.orders where id=p_order_id and deleted_at is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.status in ('completed','cancelled') then raise exception 'Pedido encerrado não permite alteração de itens'; end if;
  if p_changes_consumption and (
    (v_order.payment_status in ('partial','refunded') or (v_order.payment_status='paid' and v_order.total_cents>0)) or coalesce(v_tab_paid,0)>0
    or exists(select 1 from public.payments where order_id=p_order_id and status='paid')
  ) then raise exception 'Pedido com recebimento não permite alterar consumo; resolva o pagamento antes'; end if;
  return v_order;
end $$;

create or replace function public.recalculate_order_totals(p_order_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_subtotal integer; v_discount integer; v_total integer;
begin
  v_order:=public.lock_editable_order(p_order_id,true);
  select coalesce(sum(quantity*unit_price_cents) filter(where production_status<>'cancelled'),0)
    into v_subtotal from public.order_items where order_id=p_order_id;
  v_discount:=least(coalesce(v_order.discount_cents,0),v_subtotal);
  v_total:=greatest(0,v_subtotal-v_discount+coalesce(v_order.delivery_fee_cents,0));
  update public.orders set subtotal_cents=v_subtotal,discount_cents=v_discount,total_cents=v_total,
    payment_status=case when v_total=0 then 'paid'::public.payment_status else 'pending'::public.payment_status end,
    version=version+1,updated_at=now() where id=p_order_id;
  perform public.decrement_order_stock(p_order_id);
  return jsonb_build_object('subtotal',v_subtotal,'discount',v_discount,'deliveryFee',v_order.delivery_fee_cents,'total',v_total);
end $$;

create or replace function public.add_order_item_transaction(p_order_id text,p_item jsonb,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_item public.order_items%rowtype; v_totals jsonb; v_payload jsonb; v_sector text;
begin
  perform pg_advisory_xact_lock(hashtextextended('basso:item:'||(p_item->>'id'),0));
  -- A repeated item ID succeeds only for precisely the same command and order.
  select * into v_item from public.order_items where id=p_item->>'id';
  if found then
    if v_item.order_id<>p_order_id or v_item.kind<>p_item->>'kind'
      or v_item.quantity<>(p_item->>'quantity')::integer or v_item.unit_price_cents<>(p_item->>'unitPrice')::integer
      or coalesce(v_item.product_id,'')<>coalesce(p_item->>'productId','')
      or coalesce(v_item.selection,'{}'::jsonb)<>coalesce(p_item->'selection','{}'::jsonb)
      then raise exception 'Identificador do item já utilizado por outro lançamento'; end if;
    select jsonb_build_object('subtotal',subtotal_cents,'discount',discount_cents,'deliveryFee',delivery_fee_cents,'total',total_cents,'duplicate',true)
      into v_totals from public.orders where id=p_order_id;
    return v_totals;
  end if;
  v_order:=public.lock_editable_order(p_order_id,true);
  if coalesce(p_item->>'kind','') not in ('pizza','product','combo') then raise exception 'Tipo de item inválido'; end if;
  if (p_item->>'quantity')::integer not between 1 and 99 or (p_item->>'unitPrice')::integer<0 then raise exception 'Item inválido'; end if;
  v_sector:=case when p_item->>'kind'='product' then 'bar' else 'kitchen' end;
  insert into public.order_items(id,order_id,kind,name_snapshot,quantity,unit_price_cents,product_id,selection,sector,production_status,updated_by)
    values(p_item->>'id',p_order_id,p_item->>'kind',p_item->>'name',(p_item->>'quantity')::integer,
      (p_item->>'unitPrice')::integer,p_item->>'productId',p_item->'selection',v_sector,'queued',p_actor_id) returning * into v_item;
  update public.orders set updated_by=p_actor_id where id=p_order_id;
  v_totals:=public.recalculate_order_totals(p_order_id);
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,after_data)
    values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
      'ORDER_ITEM_ADDED','order_item',v_item.id,'Item incluído pela operação',to_jsonb(v_item));
  -- Print only the addition, with a durable command key; queue failure rolls back item/stock/total.
  select jsonb_build_object('order',to_jsonb(o),'items',jsonb_build_array(to_jsonb(v_item)),'event','item_added') into v_payload from public.orders o where id=p_order_id;
  insert into public.print_jobs(order_id,sector,printer_key,payload,is_reprint,source_key)
    select p_order_id,p.sector,case when p.sector='kitchen' then 'cozinha' else p.sector end,v_payload,true,
      p_order_id||':item:'||v_item.id||':'||p.sector
    from public.print_profiles p where p.active and p.auto_print and p.sector in (v_sector,'counter')
    group by p.sector on conflict do nothing;
  return v_totals;
end $$;


CREATE OR REPLACE FUNCTION public.manage_order_item_transaction(p_order_id text, p_item_id text, p_action text, p_value jsonb DEFAULT '{}'::jsonb, p_reason text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_before public.order_items%rowtype; v_after public.order_items%rowtype; v_totals jsonb; v_qty integer; v_notes text; v_order public.orders%rowtype; v_changes boolean;
begin
  v_changes:=p_action in ('quantity','cancel','restore') or (p_action='production_status' and p_value->>'status'='cancelled');
  v_order:=public.lock_editable_order(p_order_id,v_changes);
  select * into v_before from public.order_items where id=p_item_id and order_id=p_order_id for update;
  if not found then raise exception 'Item não encontrado'; end if;
  if (p_action in ('quantity','cancel','restore') or (p_action='production_status' and p_value->>'status'='cancelled')) and coalesce(trim(p_reason),'')='' then raise exception 'Motivo obrigatório'; end if;

  if p_action='production_status' and v_before.production_status='cancelled' and p_value->>'status'<>'cancelled' then raise exception 'Use restaurar item com motivo'; end if;
  if p_action='quantity' then
    v_qty:=(p_value->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'Quantidade inválida'; end if;
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
  if v_changes then
    update public.orders set updated_by=p_actor_id where id=p_order_id;
    v_totals:=public.recalculate_order_totals(p_order_id);
  else
    update public.orders set version=version+1,updated_at=now(),updated_by=p_actor_id where id=p_order_id;
    v_totals:=jsonb_build_object('subtotal',v_order.subtotal_cents,'discount',v_order.discount_cents,'deliveryFee',v_order.delivery_fee_cents,'total',v_order.total_cents);
  end if;
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
  perform pg_advisory_xact_lock(hashtextextended('basso:cash-session',0));
  if p_initial_cents is null or p_initial_cents<0 then raise exception 'Valor inicial inválido'; end if;
  if exists(select 1 from public.cash_sessions where status='open') then raise exception 'Já existe um caixa aberto'; end if;
  insert into public.cash_sessions(opened_by,initial_cents) values(p_actor_id,p_initial_cents) returning id into v_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data) values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'CASH_OPENED','cash_session',v_id::text,jsonb_build_object('initialCents',p_initial_cents));
  return v_id;
end $function$;


CREATE OR REPLACE FUNCTION public.create_order_transaction(p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_id text:=p_order->>'id'; v_item jsonb; v_customer_id uuid; v_phone text:=coalesce(p_order->>'customerPhone',''); v_tab_id uuid; v_table integer; v_existing public.orders%rowtype; v_actor uuid:=nullif(current_setting('app.actor_id',true),'')::uuid;
begin
  if length(coalesce(p_order->>'sourceIdempotencyKey',''))<8 then raise exception 'Chave de idempotência obrigatória'; end if;
  perform pg_advisory_xact_lock(hashtextextended('basso:order:'||(p_order->>'sourceIdempotencyKey'),0));
  select * into v_existing from public.orders where source_idempotency_key=p_order->>'sourceIdempotencyKey';
  if found then return jsonb_build_object('id',v_existing.id,'tabId',v_existing.tab_id,'duplicate',true); end if;
  if v_actor is null and p_order->>'channel' in ('own_delivery','pickup','table_qr') then
    p_order:=(p_order-'customerId'-'driverId'-'externalId'-'trackingToken')||jsonb_build_object(
      'status','received','paymentStatus','pending','createdAt',now(),'updatedAt',now(),
      'origin',case when p_order->>'channel'='table_qr' then 'table' else 'web' end);
    if p_order->>'channel'<>'table_qr' then p_order:=p_order-'tabId'-'tableNumber'-'tabName'; end if;
  end if;
  if p_order->>'channel' in ('table_qr','dine_in') then
    v_table:=nullif(p_order->>'tableNumber','')::integer;
    perform 1 from public.restaurant_tables where number=v_table for update;
    if not found then raise exception 'Mesa não cadastrada'; end if;
    if nullif(p_order->>'tabId','') is not null then
      select id into v_tab_id from public.tabs where id=(p_order->>'tabId')::uuid and table_number=v_table and status in ('open','partial') for update;
      if not found then raise exception 'Comanda da mesa não está mais aberta'; end if;
    elsif p_order->>'channel'='table_qr' and length(trim(coalesce(p_order->>'tabName','')))>=2 then
      v_tab_id:=public.open_table_tab(v_table,trim(p_order->>'tabName'),1,null);
    else raise exception 'Comanda ou participante obrigatório'; end if;
    p_order:=p_order||jsonb_build_object('tabId',v_tab_id);
  end if;
  if coalesce(p_order->>'customerId','')<>'' and p_order->>'channel' not in ('ifood','99food') then
    select id into v_customer_id from public.customers where id=(p_order->>'customerId')::uuid and active;
    if v_customer_id is null then raise exception 'Cliente selecionado não existe ou está inativo'; end if;
    update public.customers set name=p_order->>'customerName',updated_at=now() where id=v_customer_id;
  elsif p_order->>'channel' not in ('ifood','99food') and length(v_phone)>=10 then
    insert into public.customers(name,phone) values(p_order->>'customerName',v_phone) on conflict(phone) do update set name=case when v_actor is not null then excluded.name else customers.name end,updated_at=now() returning id into v_customer_id;
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
  return jsonb_build_object('id',v_order_id,'tabId',nullif(p_order->>'tabId',''),'duplicate',false);
end $function$;


CREATE OR REPLACE FUNCTION public.create_internal_order_transaction(p_order jsonb, p_reward_token text, p_actor_id uuid, p_discount_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_result jsonb; v_payment_id uuid; v_session_id uuid; v_has_reward boolean;
begin
  if p_actor_id is null or not exists(select 1 from public.profiles where id=p_actor_id and active and role in ('manager','counter','waiter')) then raise exception 'Operador não autorizado'; end if;
  perform pg_advisory_xact_lock(hashtextextended('basso:order:'||(p_order->>'sourceIdempotencyKey'),0));
  if exists(select 1 from public.orders where source_idempotency_key=p_order->>'sourceIdempotencyKey') then
    return (select jsonb_build_object('id',id,'duplicate',true) from public.orders where source_idempotency_key=p_order->>'sourceIdempotencyKey');
  end if;
  if p_order->>'channel'='dine_in' and p_order->>'paymentStatus'<>'pending' then raise exception 'Receba os pedidos da mesa pelo fechamento da comanda'; end if;
  if p_order->>'paymentStatus'='paid' and p_order->>'paymentMethod'='cash' and (p_order->>'total')::integer>0 then
    select id into v_session_id from public.cash_sessions where status='open' for update;
    if v_session_id is null then raise exception 'Abra o caixa antes de receber em dinheiro'; end if;
  end if;
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
  perform set_config('app.actor_id','',true);
  return v_result;
end $function$;


CREATE OR REPLACE FUNCTION public.record_tab_payment(p_tab_id uuid, p_amount_cents integer, p_method payment_method, p_idempotency_key text, p_actor_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tab public.tabs%rowtype; v_consumption integer; v_service integer; v_total integer; v_payment_id uuid; v_new_paid integer; v_session_id uuid; v_open_count integer; v_previous public.payments%rowtype; v_result jsonb;
begin
  if p_amount_cents is null or p_amount_cents<=0 or length(coalesce(p_idempotency_key,''))<8 then raise exception 'Pagamento inválido'; end if;
  perform pg_advisory_xact_lock(hashtextextended('basso:payment:'||p_idempotency_key,0));
  select * into v_previous from public.payments where idempotency_key=p_idempotency_key;
  if found then
    if v_previous.tab_id is distinct from p_tab_id or v_previous.method<>p_method or v_previous.amount_cents<>p_amount_cents then raise exception 'Chave de pagamento já utilizada por outro lançamento'; end if;
    if v_previous.metadata ? 'result' then return (v_previous.metadata->'result')||jsonb_build_object('duplicate',true); end if;
    select * into v_tab from public.tabs where id=p_tab_id;
    return jsonb_build_object('paymentId',v_previous.id,'paidCents',v_tab.paid_cents,'closed',v_tab.status='closed','duplicate',true);
  end if;
  if p_amount_cents<=0 then raise exception 'Valor inválido'; end if;
  select * into v_tab from public.tabs where id=p_tab_id and status in ('open','partial') for update;
  if not found then raise exception 'Comanda não encontrada'; end if;
  select coalesce(sum(o.total_cents),0) into v_consumption from public.orders o where o.tab_id=p_tab_id and o.status<>'cancelled';
  if v_consumption<=0 then raise exception 'A comanda não possui consumo para receber'; end if;
  perform 1 from public.orders where tab_id=p_tab_id order by id for update;
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
  v_result:=jsonb_build_object('paidCents',v_new_paid,'totalCents',v_total,'serviceChargeCents',v_service,'closed',v_new_paid>=v_total,'paymentId',v_payment_id,'duplicate',false);
  update public.payments set metadata=metadata||jsonb_build_object('result',v_result) where id=v_payment_id;
  return v_result;
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
  perform pg_advisory_xact_lock(hashtextextended('basso:payment:'||p_idempotency_key,0));
  if p_amount <= 0 then raise exception 'Valor inválido'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.tab_id is not null then raise exception 'Receba os pedidos da mesa pela comanda'; end if;

  select id into v_payment_id from public.payments where idempotency_key = p_idempotency_key;
  if v_payment_id is not null then
    if not exists(select 1 from public.payments where id=v_payment_id and order_id=p_order_id and method=p_method and amount_cents=p_amount) then raise exception 'Chave de pagamento já utilizada por outro lançamento'; end if;
    select coalesce(sum(amount_cents),0) into v_paid
      from public.payments where order_id = p_order_id and status = 'paid';
    return jsonb_build_object(
      'paymentId', v_payment_id,
      'paidAmount', v_paid,
      'paymentStatus', v_order.payment_status,
      'duplicate', true
    );
  end if;

  if v_order.status='cancelled' or v_order.deleted_at is not null then raise exception 'Pedido cancelado não pode receber pagamento'; end if;
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


drop function public.change_order_status_controlled(text,public.order_status,text,uuid);
CREATE OR REPLACE FUNCTION public.change_order_status_controlled(p_order_id text, p_status order_status, p_reason text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid, p_expected_version integer DEFAULT NULL::integer)
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
  v_new_rank integer; v_version integer; v_tab uuid;
begin
  select tab_id into v_tab from public.orders where id=p_order_id;
  if v_tab is not null then perform 1 from public.tabs where id=v_tab for update; end if;
  select status,channel,customer_id,payment_status,version
    into v_old,v_channel,v_customer,v_payment,v_version
    from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if p_expected_version is not null and p_expected_version<>v_version then raise exception 'ORDER_VERSION_CONFLICT: pedido alterado em outro dispositivo'; end if;
  if p_status=v_old then return; end if;
  if p_status='cancelled' and (v_payment in ('paid','partial','refunded') or exists(select 1 from public.payments where order_id=p_order_id and status='paid') or exists(select 1 from public.tabs where id=v_tab and paid_cents>0)) then raise exception 'Pedido com recebimento exige conciliação antes do cancelamento'; end if;
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

  perform public.decrement_order_stock(p_order_id);

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


-- Order-level money changes obey the same locks and receipt restrictions as item changes.
create or replace function public.update_order_transaction(p_order_id text,p_patch jsonb,p_reason text,p_actor_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_before public.orders%rowtype; v_after public.orders%rowtype; v_key text; v_money boolean;
begin
  if length(trim(coalesce(p_reason,'')))<2 then raise exception 'Motivo obrigatório'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('customer_name','customer_phone','address','notes','internal_summary','priority','estimated_ready_at','discount_cents','delivery_fee_cents') then raise exception 'Campo de alteração inválido'; end if;
  end loop;
  v_money:=p_patch ?| array['discount_cents','delivery_fee_cents'];
  v_before:=public.lock_editable_order(p_order_id,v_money);
  if v_before.version<>p_expected_version then raise exception 'ORDER_VERSION_CONFLICT: pedido alterado em outro dispositivo'; end if;
  v_after:=jsonb_populate_record(v_before,p_patch);
  if v_after.discount_cents<0 or v_after.delivery_fee_cents<0 then raise exception 'Valores inválidos'; end if;
  update public.orders set customer_name=v_after.customer_name,customer_phone=v_after.customer_phone,
    address=v_after.address,notes=v_after.notes,internal_summary=v_after.internal_summary,priority=v_after.priority,
    estimated_ready_at=v_after.estimated_ready_at,discount_cents=least(subtotal_cents,v_after.discount_cents),
    delivery_fee_cents=v_after.delivery_fee_cents,total_cents=greatest(0,subtotal_cents-least(subtotal_cents,v_after.discount_cents)+v_after.delivery_fee_cents),version=version+1,updated_at=now(),updated_by=p_actor_id where id=p_order_id;
  if v_money then perform public.recalculate_order_totals(p_order_id); end if;
  select * into v_after from public.orders where id=p_order_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data)
    values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
      'ORDER_UPDATED','order',p_order_id,p_reason,to_jsonb(v_before),to_jsonb(v_after));
  return to_jsonb(v_after);
end $$;


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
  if v_tab.paid_cents>0 then raise exception 'Defina a taxa de serviço antes de iniciar os recebimentos'; end if;
  select coalesce(sum(total_cents),0) into v_consumption from public.orders where tab_id=p_tab_id and status<>'cancelled';
  v_charge:=case when p_applied then round(v_consumption*(v_tab.service_charge_rate_percent/100.0))::integer else 0 end;
  if v_tab.paid_cents>v_consumption+v_charge then raise exception 'Não é possível retirar a taxa após pagamentos que excedam o novo total'; end if;
  update public.tabs set service_charge_applied=p_applied,service_charge_cents=v_charge,updated_at=now(),version=version+1 where id=p_tab_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),case when p_applied then 'TAB_SERVICE_CHARGE_ENABLED' else 'TAB_SERVICE_CHARGE_REMOVED' end,'tab',p_tab_id::text,jsonb_build_object('ratePercent',v_tab.service_charge_rate_percent,'chargeCents',v_charge));
  return jsonb_build_object('applied',p_applied,'serviceChargeCents',v_charge,'consumptionCents',v_consumption,'totalCents',v_consumption+v_charge);
end $function$;


create or replace function public.manage_tab_transaction(p_tab_id uuid,p_action text,p_name text,p_reason text,p_actor_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_tab public.tabs%rowtype; v_order record;
begin
  select * into v_tab from public.tabs where id=p_tab_id for update;
  if not found then raise exception 'Comanda não encontrada'; end if;
  if v_tab.status not in ('open','partial') then raise exception 'Comanda encerrada não permite alteração'; end if;
  if p_action='rename' then
    if length(trim(coalesce(p_name,'')))<1 then raise exception 'Nome obrigatório'; end if;
    update public.tabs set name=trim(p_name),version=version+1,updated_at=now() where id=p_tab_id;
  elsif p_action='cancel' then
    if length(trim(coalesce(p_reason,'')))<2 then raise exception 'Motivo obrigatório'; end if;
    if v_tab.paid_cents>0 or exists(select 1 from public.payments where tab_id=p_tab_id and status='paid')
      or exists(select 1 from public.orders where tab_id=p_tab_id and payment_status in ('paid','partial','refunded') and status<>'cancelled')
      then raise exception 'Comanda com recebimento exige conciliação antes do cancelamento'; end if;
    for v_order in select id,version from public.orders where tab_id=p_tab_id and status<>'cancelled' order by id for update loop
      perform public.change_order_status_controlled(v_order.id,'cancelled',p_reason,p_actor_id,v_order.version);
    end loop;
    update public.tabs set status='cancelled',closed_at=now(),version=version+1,updated_at=now() where id=p_tab_id;
    if not exists(select 1 from public.tabs where table_number=v_tab.table_number and status in ('open','partial')) then
      update public.restaurant_tables set status='free',people_count=null,opened_at=null,opened_by=null,group_id=null,version=version+1,updated_at=now() where number=v_tab.table_number;
    end if;
  else raise exception 'Ação de comanda inválida'; end if;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data)
    values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
      case when p_action='rename' then 'TAB_RENAMED' else 'TAB_CANCELLED' end,'tab',p_tab_id::text,p_reason,to_jsonb(v_tab));
end $$;

-- Every new/replaced public helper is server-only, including its default arguments.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'set_tab_service_charge','update_order_transaction','decrement_order_stock','lock_editable_order','recalculate_order_totals','add_order_item_transaction',
      'manage_order_item_transaction','open_cash_session','create_order_transaction','create_internal_order_transaction',
      'record_tab_payment','record_order_payment_transaction','change_order_status_controlled','manage_tab_transaction'
    ) loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
insert into public.system_migrations(version,name) values('032','audit_operation_integrity') on conflict(version) do nothing;
notify pgrst, 'reload schema';

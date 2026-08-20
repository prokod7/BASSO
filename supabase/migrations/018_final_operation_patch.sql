-- PedidoPro Mega Update 08 — Final Operation Patch
-- Regras finais solicitadas pela operação Basso: adicionais por metade, PDV/WhatsApp,
-- taxa de serviço, motoboy autônomo, catálogo, impressão e rastreabilidade de origem.

insert into public.system_migrations(version,name)
values(18,'final_operation_patch')
on conflict(version) do update set name=excluded.name;

-- ---------------------------------------------------------------------------
-- 1. Origem operacional do pedido (WhatsApp/telefone/balcão/web/marketplace)
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists order_origin text;
do $$ begin
  alter table public.orders add constraint orders_order_origin_check
  check(order_origin is null or order_origin in ('web','whatsapp','phone','counter','table','marketplace'));
exception when duplicate_object then null; end $$;
update public.orders set order_origin=case when channel in ('ifood','99food') then 'marketplace' when channel in ('dine_in','table_qr') then 'table' when channel='counter' then 'counter' else 'web' end where order_origin is null;
create index if not exists orders_origin_created_idx on public.orders(order_origin,created_at desc) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. Taxa de serviço das comandas. 10% por padrão, removível antes do fechamento.
-- ---------------------------------------------------------------------------
alter table public.tabs add column if not exists service_charge_rate_percent numeric(5,2) not null default 10.00;
alter table public.tabs add column if not exists service_charge_applied boolean not null default true;
alter table public.tabs add column if not exists service_charge_cents integer not null default 0;
do $$ begin
  alter table public.tabs add constraint tabs_service_charge_rate_check check(service_charge_rate_percent between 0 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tabs add constraint tabs_service_charge_cents_check check(service_charge_cents>=0);
exception when duplicate_object then null; end $$;

create or replace function public.set_tab_service_charge(p_tab_id uuid,p_applied boolean,p_actor_id uuid default auth.uid()) returns jsonb
language plpgsql security definer set search_path=public as $$
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
end $$;
grant execute on function public.set_tab_service_charge(uuid,boolean,uuid) to authenticated,service_role;

create or replace function public.record_tab_payment(
  p_tab_id uuid,p_amount_cents integer,p_method public.payment_method,p_idempotency_key text,p_actor_id uuid default auth.uid()
) returns jsonb
language plpgsql security definer set search_path=public as $$
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
end $$;
grant execute on function public.record_tab_payment(uuid,integer,public.payment_method,text,uuid) to authenticated,service_role;

create or replace function public.record_cash_movement(
  p_kind text,
  p_amount_cents integer,
  p_reason text,
  p_actor_id uuid default auth.uid()
) returns uuid
language plpgsql security definer set search_path=public as $$
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
end $$;
grant execute on function public.record_cash_movement(text,integer,text,uuid) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3. Criação interna: preserva cliente da base, origem, tab e regras atuais.
-- ---------------------------------------------------------------------------
create or replace function public.create_order_transaction(p_order jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
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
end $$;
grant execute on function public.create_order_transaction(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Motoboy escolhe a próxima entrega. Proteção atômica contra dois motoboys.
-- ---------------------------------------------------------------------------
create or replace function public.assign_delivery(p_order_id text,p_driver_id uuid,p_token_hash text,p_expires_at timestamptz,p_actor_id uuid default auth.uid()) returns void
language plpgsql security definer set search_path=public as $$
declare v_driver public.drivers%rowtype; v_order public.orders%rowtype; v_actor_role public.app_role;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.channel<>'own_delivery' then raise exception 'Atribuição disponível somente para delivery próprio'; end if;
  if v_order.status<>'ready' then raise exception 'Motoboy só pode assumir pedido pronto para entrega'; end if;
  if v_order.driver_id is not null and v_order.driver_id<>p_driver_id then raise exception 'Outro motoboy já assumiu este pedido'; end if;
  select * into v_driver from public.drivers where id=p_driver_id and active for update;
  if not found then raise exception 'Motoboy não encontrado'; end if;
  if not exists(select 1 from public.driver_shifts where driver_id=p_driver_id and status='active') then raise exception 'Inicie o turno antes de assumir uma entrega'; end if;
  if not v_driver.available and v_driver.active_order_id is distinct from p_order_id then raise exception 'Finalize a entrega atual antes de escolher outra'; end if;
  if p_actor_id is not null then
    select role into v_actor_role from public.profiles where id=p_actor_id;
    if v_actor_role='driver' and v_driver.profile_id is distinct from p_actor_id then raise exception 'Motoboy só pode assumir entrega no próprio perfil'; end if;
  end if;
  update public.drivers set available=false,active_order_id=p_order_id,updated_at=now() where id=p_driver_id;
  update public.orders set driver_id=p_driver_id,updated_at=now(),updated_by=p_actor_id where id=p_order_id;
  insert into public.tracking_tokens(order_id,token_hash,expires_at,customer_visible) values(p_order_id,p_token_hash,p_expires_at,true)
  on conflict(order_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked_at=null,customer_visible=true,delivered_at=null;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data) values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),v_driver.name),'DRIVER_CLAIMED_DELIVERY','order',p_order_id,jsonb_build_object('driverId',p_driver_id,'expiresAt',p_expires_at));
end $$;
grant execute on function public.assign_delivery(text,uuid,text,timestamptz,uuid) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 5. Catálogo: salsa removida; Schweppes lata desativada; Del Valle por sabor.
-- ---------------------------------------------------------------------------
update public.pizza_flavors
set ingredients=array_remove(ingredients,'salsa'),
    description=replace(replace(description,', salsa',''),' salsa e ',' e '),
    version=version+1,updated_at=now()
where id='salame';

update public.products set active=false,updated_at=now() where id='agua-tonica-schweppes-lata-350-ml';
update public.products set active=false,updated_at=now() where id='suco-del-valle-lata-290-ml';

insert into public.products(id,name,category,description,price_cents,image_url,stock_tracked,active,available_channels,available_schedule,config)
values
('suco-del-valle-uva-lata-290-ml','Suco Del Valle Uva lata 290 ml','beverages','Suco Del Valle sabor Uva, lata 290 ml.',700,'/assets/products/sucos-del-valle-290ml-lata.jpg',false,true,array['own_delivery','pickup','counter','dine_in','table_qr']::public.order_channel[],'{}'::jsonb,'{}'::jsonb),
('suco-del-valle-pessego-lata-290-ml','Suco Del Valle Pêssego lata 290 ml','beverages','Suco Del Valle sabor Pêssego, lata 290 ml.',700,'/assets/products/sucos-del-valle-290ml-lata.jpg',false,true,array['own_delivery','pickup','counter','dine_in','table_qr']::public.order_channel[],'{}'::jsonb,'{}'::jsonb),
('suco-del-valle-goiaba-lata-290-ml','Suco Del Valle Goiaba lata 290 ml','beverages','Suco Del Valle sabor Goiaba, lata 290 ml.',700,'/assets/products/sucos-del-valle-290ml-lata.jpg',false,true,array['own_delivery','pickup','counter','dine_in','table_qr']::public.order_channel[],'{}'::jsonb,'{}'::jsonb),
('suco-del-valle-maracuja-lata-290-ml','Suco Del Valle Maracujá lata 290 ml','beverages','Suco Del Valle sabor Maracujá, lata 290 ml.',700,'/assets/products/sucos-del-valle-290ml-lata.jpg',false,true,array['own_delivery','pickup','counter','dine_in','table_qr']::public.order_channel[],'{}'::jsonb,'{}'::jsonb)
on conflict(id) do update set name=excluded.name,description=excluded.description,price_cents=excluded.price_cents,image_url=excluded.image_url,stock_tracked=false,active=true,updated_at=now();

update public.products
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object('allowHalfHalf',true,'allowAddonPlacement',true,'grandeFlavors',(select jsonb_agg(id order by name) from public.pizza_flavors where active)),
    updated_at=now()
where id='combo-grande-broto-refri' and category='combo';

-- ---------------------------------------------------------------------------
-- 6. Impressão: não disparar jobs históricos quando o bridge finalmente ligar.
-- O heartbeat real reativa a integração; auto_print continua manual até teste físico.
-- ---------------------------------------------------------------------------
update public.print_jobs set status='cancelled',last_error='Job histórico cancelado pelo MU08 antes da ativação do Print Bridge',processed_at=now(),claimed_at=null
where status in ('queued','processing') and created_at < now()-interval '24 hours';
insert into public.integration_connections(provider,active,environment,last_health_status,last_error_message,metadata)
values('printer',false,'production','warning','Aguardando heartbeat do Print Bridge local','{"required":"PRINT_BRIDGE_KEY + agente local"}'::jsonb)
on conflict(provider) do update set environment='production',active=false,last_health_status='warning',last_error_message='Aguardando heartbeat do Print Bridge local',updated_at=now();

insert into public.audit_logs(actor_label,action,entity_type,entity_id,after_data)
values('Sistema','MU08_FINAL_OPERATION_PATCH','system','18',jsonb_build_object('pizzaCrossCategoryHalfHalf',true,'addonHalfPricing',true,'serviceChargePercent',10,'whatsappPdv',true,'driverChoosesDelivery',true,'printingHeartbeat',true));

-- Broto salgada: até 2 sabores salgados; broto doce: 1 sabor.
-- Não reescreve itens históricos, preços de pedidos ou saldos.
alter table public.order_items drop constraint if exists broto_single_flavor;
create or replace function public.validate_broto_item() returns trigger
language plpgsql set search_path=public as $$
declare a text; b text;
begin
  if new.selection->>'size'='broto' and coalesce(new.selection->>'flavorB','')<>'' then
    select category into a from public.pizza_flavors where id=new.selection->>'flavorA';
    select category into b from public.pizza_flavors where id=new.selection->>'flavorB';
    if a is null or b is null or a='sweet' or b='sweet' then raise exception 'Broto doce aceita somente um sabor. Meio a meio na broto exige dois sabores salgados'; end if;
    if new.selection->>'flavorA'=new.selection->>'flavorB' then raise exception 'Escolha sabores diferentes'; end if;
  end if;
  return new;
end $$;
revoke all on function public.validate_broto_item() from public,anon,authenticated;
grant execute on function public.validate_broto_item() to service_role;
drop trigger if exists validate_broto_composition on public.order_items;
create trigger validate_broto_composition before insert or update of selection on public.order_items for each row execute function public.validate_broto_item();

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
    -- Pizza composition is checked by the item trigger for inserts and edits.
    insert into public.order_items(id,order_id,kind,name_snapshot,quantity,unit_price_cents,product_id,selection,sector)
    values(v_item->>'id',v_order_id,v_item->>'kind',v_item->>'name',(v_item->>'quantity')::integer,(v_item->>'unitPrice')::integer,v_item->>'productId',v_item->'selection',case when v_item->>'kind'='product' then 'bar' else 'kitchen' end);
  end loop;
  perform public.decrement_order_stock(v_order_id);
  insert into public.order_status_history(order_id,to_status,actor_id,source) values(v_order_id,(p_order->>'status')::public.order_status,v_actor,'create_order');
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data) values(v_actor,coalesce((select display_name from public.profiles where id=v_actor),'Sistema'),'ORDER_CREATED','order',v_order_id,p_order);
  return jsonb_build_object('id',v_order_id,'tabId',nullif(p_order->>'tabId',''),'duplicate',false);
end $function$;


revoke all on function public.create_order_transaction(jsonb) from public,anon,authenticated;
grant execute on function public.create_order_transaction(jsonb) to service_role;

do $$
 declare promo uuid;
 begin
   -- Não sobrescrever uma oferta já administrada pelo gestor.
   if not exists(select 1 from public.promotions where name='Terça Maluca') then
     if (select count(*) from public.pizza_flavors where id=any(array['calabresa-tradicional','bauru','mozzarella','calabresa-com-catupiry','margherita','chocolate','brigadeiro','kitkat'])) <> 8 then raise exception 'Sabores oficiais ausentes: Terça Maluca'; end if;
     insert into public.promotions(name,description,badge_text,promo_price_cents,channels,days_of_week,pizza_size)
     values('Terça Maluca','Pizza Grande inteira ou meio a meio entre os sabores participantes. Somente delivery e retirada; taxa de entrega à parte.','Terça Maluca',3999,array['own_delivery','pickup']::public.order_channel[],array[2]::smallint[],'grande') returning id into promo;
     insert into public.promotion_targets(promotion_id,flavor_id) select promo,id from public.pizza_flavors where id=any(array['calabresa-tradicional','bauru','mozzarella','calabresa-com-catupiry','margherita','chocolate','brigadeiro','kitkat']);
   end if;
 end $$;
do $$
 declare promo uuid;
 begin
   -- Não sobrescrever uma oferta já administrada pelo gestor.
   if not exists(select 1 from public.promotions where name='Quarta da Pizza') then
     if (select count(*) from public.pizza_flavors where id=any(array['alho-e-oleo','bauru','bacon','baiana','brocolis','brigadeiro','calabresa-com-catupiry','calabresa-tradicional','chocolate','dois-queijos','margherita','milho','mozzarella','napolitana','palmito','toscana'])) <> 16 then raise exception 'Sabores oficiais ausentes: Quarta da Pizza'; end if;
     insert into public.promotions(name,description,badge_text,promo_price_cents,channels,days_of_week,pizza_size)
     values('Quarta da Pizza','Pizza Grande inteira ou meio a meio entre os sabores participantes. Somente delivery e retirada; taxa de entrega à parte.','Quarta da Pizza',4499,array['own_delivery','pickup']::public.order_channel[],array[3]::smallint[],'grande') returning id into promo;
     insert into public.promotion_targets(promotion_id,flavor_id) select promo,id from public.pizza_flavors where id=any(array['alho-e-oleo','bauru','bacon','baiana','brocolis','brigadeiro','calabresa-com-catupiry','calabresa-tradicional','chocolate','dois-queijos','margherita','milho','mozzarella','napolitana','palmito','toscana']);
   end if;
 end $$;
do $$
 declare promo uuid;
 begin
   -- Não sobrescrever uma oferta já administrada pelo gestor.
   if not exists(select 1 from public.promotions where name='Quinta das Tradicionais') then
     if (select count(*) from public.pizza_flavors where id=any(array['alho-e-oleo','bacon','baiana','bauru','brocolis','calabresa-com-catupiry','calabresa-com-mozzarella','calabresa-tradicional','dois-queijos','escarola','frango-com-catupiry','frango-com-mozzarella','lombinho','margherita','milho','mozzarella','napolitana','palmito','portuguesa','pepperoni','toscana'])) <> 21 then raise exception 'Sabores oficiais ausentes: Quinta das Tradicionais'; end if;
     insert into public.promotions(name,description,badge_text,promo_price_cents,channels,days_of_week,pizza_size)
     values('Quinta das Tradicionais','Pizza Grande inteira ou meio a meio entre os sabores participantes. Somente delivery e retirada; taxa de entrega à parte.','Quinta das Tradicionais',4990,array['own_delivery','pickup']::public.order_channel[],array[4]::smallint[],'grande') returning id into promo;
     insert into public.promotion_targets(promotion_id,flavor_id) select promo,id from public.pizza_flavors where id=any(array['alho-e-oleo','bacon','baiana','bauru','brocolis','calabresa-com-catupiry','calabresa-com-mozzarella','calabresa-tradicional','dois-queijos','escarola','frango-com-catupiry','frango-com-mozzarella','lombinho','margherita','milho','mozzarella','napolitana','palmito','portuguesa','pepperoni','toscana']);
   end if;
 end $$;
insert into public.products(id,name,category,description,price_cents,stock_tracked,active,available_channels,available_schedule,config)
 values('combo-premium-1','Combo Premium 1','combo','1 Pizza Grande salgada Premium + 1 Broto doce + 1 refrigerante 2 L. Válido todos os dias.',15590,false,true,array['own_delivery','pickup','counter','dine_in','table_qr']::public.order_channel[],'{"days":[0,1,2,3,4,5,6]}'::jsonb,'{"grandeFlavors": ["atum-solido-com-cream-cheese", "camarao", "caprese", "costela-barbecue", "doritos", "la-nordestina", "la-toscana-blue", "salmao-com-cream-cheese", "sapori-di-parma", "seis-queijos", "file-mignon"], "sweetFlavors": ["alegria-de-confites", "amor-proibido", "chocolate", "chocolate-com-morango", "kinder-bueno", "kitkat", "laka-oreo", "sonho-de-valsa", "tortuguita", "rafaello"], "sweetFlavor": "alegria-de-confites", "beverages": ["coca-cola-2-l", "guarana-antarctica-2-l", "fanta-uva-2-l", "fanta-laranja-2-l", "sprite-2-l"], "grandeQuantity": 1, "sweetSize": "broto", "masses": ["traditional", "integral"], "allowHalfHalf": true}'::jsonb)
 on conflict(id) do nothing;
insert into public.products(id,name,category,description,price_cents,stock_tracked,active,available_channels,available_schedule,config)
 values('combo-premium-2','Combo Premium 2','combo','2 Pizzas Grandes salgadas Premium + 1 Pizza Grande doce + 1 refrigerante 2 L. Válido todos os dias.',26990,false,true,array['own_delivery','pickup','counter','dine_in','table_qr']::public.order_channel[],'{"days":[0,1,2,3,4,5,6]}'::jsonb,'{"grandeFlavors": ["atum-solido-com-cream-cheese", "camarao", "caprese", "costela-barbecue", "doritos", "la-nordestina", "la-toscana-blue", "salmao-com-cream-cheese", "sapori-di-parma", "seis-queijos", "file-mignon"], "sweetFlavors": ["alegria-de-confites", "amor-proibido", "chocolate", "chocolate-com-morango", "kinder-bueno", "kitkat", "laka-oreo", "sonho-de-valsa", "tortuguita", "rafaello"], "sweetFlavor": "alegria-de-confites", "beverages": ["coca-cola-2-l", "guarana-antarctica-2-l", "fanta-uva-2-l", "fanta-laranja-2-l", "sprite-2-l"], "grandeQuantity": 2, "sweetSize": "grande", "masses": ["traditional", "integral"], "allowHalfHalf": true}'::jsonb)
 on conflict(id) do nothing;


-- Combos Tradicionais: listas específicas das artes enviadas em 15/10.
insert into public.products(id,name,category,description,price_cents,stock_tracked,active,available_channels,available_schedule,config)
 values('combo-tradicional-1','Combo Tradicional 1','combo','1 Pizza Grande salgada Tradicional + 1 Broto doce + 1 refrigerante 2 L. Válido todos os dias.',11090,false,true,array['own_delivery','pickup','counter','dine_in','table_qr']::public.order_channel[],'{"days":[0,1,2,3,4,5,6]}'::jsonb,'{"grandeFlavors": ["alho-e-oleo", "bacon", "baiana", "bauru", "brocolis", "calabresa-tradicional", "cheddar", "dois-queijos", "margherita", "milho", "mozzarella", "napolitana", "palmito", "parmegiana", "pepperoni", "salame", "tomate-seco-com-rucula", "toscana", "tres-queijos", "vegetariana"], "sweetFlavors": ["alegria-de-confites", "amor-proibido", "chocolate", "chocolate-com-morango", "kinder-bueno", "kitkat", "laka-oreo", "sonho-de-valsa", "tortuguita"], "sweetFlavor": "alegria-de-confites", "beverages": ["coca-cola-2-l", "guarana-antarctica-2-l", "fanta-uva-2-l", "fanta-laranja-2-l", "sprite-2-l"], "grandeQuantity": 1, "sweetSize": "broto", "masses": ["traditional", "integral"], "allowHalfHalf": true}'::jsonb)
 on conflict(id) do nothing;
insert into public.products(id,name,category,description,price_cents,stock_tracked,active,available_channels,available_schedule,config)
 values('combo-tradicional-2','Combo Tradicional 2','combo','2 Pizzas Grandes salgadas Tradicionais + 1 Pizza Grande doce + 1 refrigerante 2 L. Válido todos os dias.',17990,false,true,array['own_delivery','pickup','counter','dine_in','table_qr']::public.order_channel[],'{"days":[0,1,2,3,4,5,6]}'::jsonb,'{"grandeFlavors": ["alho-e-oleo", "bacon", "baiana", "bauru", "brocolis", "calabresa-tradicional", "cheddar", "dois-queijos", "margherita", "milho", "mozzarella", "napolitana", "palmito", "parmegiana", "pepperoni", "salame", "tomate-seco-com-rucula", "toscana", "tres-queijos", "vegetariana"], "sweetFlavors": ["alegria-de-confites", "amor-proibido", "chocolate", "chocolate-com-morango", "kinder-bueno", "kitkat", "laka-oreo", "sonho-de-valsa", "tortuguita"], "sweetFlavor": "alegria-de-confites", "beverages": ["coca-cola-2-l", "guarana-antarctica-2-l", "fanta-uva-2-l", "fanta-laranja-2-l", "sprite-2-l"], "grandeQuantity": 2, "sweetSize": "grande", "masses": ["traditional", "integral"], "allowHalfHalf": true}'::jsonb)
 on conflict(id) do nothing;

insert into public.system_migrations(version,name) values('033','menu_autonomy_and_offers') on conflict(version) do nothing;
notify pgrst,'reload schema';

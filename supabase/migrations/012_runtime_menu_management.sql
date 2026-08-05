-- Runtime cardápio management: prices, channels, schedules and active/esgotado status with history.
create or replace function public.update_menu_item(
  p_entity text,
  p_id text,
  p_active boolean,
  p_price_grande integer default null,
  p_price_broto integer default null,
  p_price integer default null,
  p_channels public.order_channel[] default null,
  p_schedule jsonb default null,
  p_actor_id uuid default auth.uid()
) returns void
language plpgsql security definer set search_path=public as $$
declare v_before jsonb; v_old_grande integer; v_old_broto integer; v_old_price integer;
begin
  if p_entity='flavor' then
    select to_jsonb(f),f.price_grande_cents,f.price_broto_cents into v_before,v_old_grande,v_old_broto from public.pizza_flavors f where id=p_id for update;
    if v_before is null then raise exception 'Sabor não encontrado'; end if;
    if coalesce(p_price_grande,v_old_grande)<0 or coalesce(p_price_broto,v_old_broto)<0 then raise exception 'Preço inválido'; end if;
    if p_price_grande is not null and p_price_grande<>v_old_grande then
      update public.price_history set valid_until=now() where entity_type='pizza_flavor' and entity_id=p_id and price_kind='grande' and valid_until is null;
      insert into public.price_history(entity_type,entity_id,price_kind,price_cents,changed_by) values('pizza_flavor',p_id,'grande',p_price_grande,p_actor_id);
    end if;
    if p_price_broto is not null and p_price_broto<>v_old_broto then
      update public.price_history set valid_until=now() where entity_type='pizza_flavor' and entity_id=p_id and price_kind='broto' and valid_until is null;
      insert into public.price_history(entity_type,entity_id,price_kind,price_cents,changed_by) values('pizza_flavor',p_id,'broto',p_price_broto,p_actor_id);
    end if;
    update public.pizza_flavors set active=p_active,price_grande_cents=coalesce(p_price_grande,price_grande_cents),price_broto_cents=coalesce(p_price_broto,price_broto_cents),available_channels=coalesce(p_channels,available_channels),available_schedule=coalesce(p_schedule,available_schedule),version=version+1,updated_at=now() where id=p_id;
  elsif p_entity='product' then
    select to_jsonb(p),p.price_cents into v_before,v_old_price from public.products p where id=p_id for update;
    if v_before is null then raise exception 'Produto não encontrado'; end if;
    if coalesce(p_price,v_old_price)<0 then raise exception 'Preço inválido'; end if;
    if p_price is not null and p_price<>v_old_price then
      update public.price_history set valid_until=now() where entity_type='product' and entity_id=p_id and price_kind='base' and valid_until is null;
      insert into public.price_history(entity_type,entity_id,price_kind,price_cents,changed_by) values('product',p_id,'base',p_price,p_actor_id);
    end if;
    update public.products set active=p_active,price_cents=coalesce(p_price,price_cents),available_channels=coalesce(p_channels,available_channels),available_schedule=coalesce(p_schedule,available_schedule),version=version+1,updated_at=now() where id=p_id;
  elsif p_entity='addon' then
    select to_jsonb(a),a.price_cents into v_before,v_old_price from public.addons a where id=p_id for update;
    if v_before is null then raise exception 'Adicional não encontrado'; end if;
    if coalesce(p_price,v_old_price)<0 then raise exception 'Preço inválido'; end if;
    if p_price is not null and p_price<>v_old_price then
      update public.price_history set valid_until=now() where entity_type='addon' and entity_id=p_id and price_kind='base' and valid_until is null;
      insert into public.price_history(entity_type,entity_id,price_kind,price_cents,changed_by) values('addon',p_id,'base',p_price,p_actor_id);
    end if;
    update public.addons set active=p_active,price_cents=coalesce(p_price,price_cents),version=version+1,updated_at=now() where id=p_id;
  else
    raise exception 'Tipo de item inválido';
  end if;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'MENU_ITEM_UPDATED',p_entity,p_id,v_before,jsonb_build_object('active',p_active,'priceGrande',p_price_grande,'priceBroto',p_price_broto,'price',p_price,'channels',p_channels,'schedule',p_schedule));
end $$;

grant execute on function public.update_menu_item(text,text,boolean,integer,integer,integer,public.order_channel[],jsonb,uuid) to authenticated,service_role;

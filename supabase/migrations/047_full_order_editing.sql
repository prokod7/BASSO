-- Permissão total para editar pedidos já feitos (pedido do responsável): adicionar, remover,
-- mudar quantidade e forma de pagamento também em pedidos concluídos ou já pagos.
-- Só pedido cancelado continua travado. O status de pagamento passa a ser recalculado
-- pelos recebimentos registrados (pago, parcial ou pendente) depois de cada alteração.

create or replace function public.lock_editable_order(p_order_id text, p_changes_consumption boolean default false)
returns public.orders language plpgsql security definer set search_path to 'public' as $function$
declare v_order public.orders%rowtype; v_tab uuid; v_tab_paid integer;
begin
  select tab_id into v_tab from public.orders where id=p_order_id;
  if v_tab is not null then
    select paid_cents into v_tab_paid from public.tabs where id=v_tab for update;
  end if;
  select * into v_order from public.orders where id=p_order_id and deleted_at is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.status = 'cancelled' then raise exception 'Pedido cancelado não pode ser alterado'; end if;
  return v_order;
end $function$;

create or replace function public.recalculate_order_totals(p_order_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_order public.orders%rowtype; v_subtotal integer; v_discount integer; v_total integer; v_paid integer;
begin
  v_order:=public.lock_editable_order(p_order_id,true);
  select coalesce(sum(quantity*unit_price_cents) filter(where production_status<>'cancelled'),0)
    into v_subtotal from public.order_items where order_id=p_order_id;
  v_discount:=least(coalesce(v_order.discount_cents,0),v_subtotal);
  v_total:=greatest(0,v_subtotal-v_discount+coalesce(v_order.delivery_fee_cents,0));
  select coalesce(sum(amount_cents),0) into v_paid from public.payments where order_id=p_order_id and status='paid';
  update public.orders set subtotal_cents=v_subtotal,discount_cents=v_discount,total_cents=v_total,
    payment_status=case
      when v_total=0 or (v_paid>0 and v_paid>=v_total) then 'paid'::public.payment_status
      when v_paid>0 then 'partial'::public.payment_status
      when v_order.payment_status='paid' and not exists(select 1 from public.payments where order_id=p_order_id) and v_total<=v_order.total_cents then 'paid'::public.payment_status
      else 'pending'::public.payment_status end,
    version=version+1,updated_at=now() where id=p_order_id;
  perform public.decrement_order_stock(p_order_id);
  return jsonb_build_object('subtotal',v_subtotal,'discount',v_discount,'deliveryFee',v_order.delivery_fee_cents,'total',v_total);
end $function$;

create or replace function public.update_order_transaction(p_order_id text, p_patch jsonb, p_reason text, p_actor_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_before public.orders%rowtype; v_after public.orders%rowtype; v_key text; v_money boolean;
begin
  if length(trim(coalesce(p_reason,'')))<2 then raise exception 'Motivo obrigatório'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('customer_name','customer_phone','address','notes','internal_summary','priority','estimated_ready_at','discount_cents','delivery_fee_cents','payment_method','change_for_cents') then raise exception 'Campo de alteração inválido'; end if;
  end loop;
  v_money:=p_patch ?| array['discount_cents','delivery_fee_cents'];
  v_before:=public.lock_editable_order(p_order_id,v_money);
  if v_before.version<>p_expected_version then raise exception 'ORDER_VERSION_CONFLICT: pedido alterado em outro dispositivo'; end if;
  v_after:=jsonb_populate_record(v_before,p_patch);
  if v_after.discount_cents<0 or v_after.delivery_fee_cents<0 or coalesce(v_after.change_for_cents,0)<0 then raise exception 'Valores inválidos'; end if;
  update public.orders set customer_name=v_after.customer_name,customer_phone=v_after.customer_phone,
    address=v_after.address,notes=v_after.notes,internal_summary=v_after.internal_summary,priority=v_after.priority,
    estimated_ready_at=v_after.estimated_ready_at,payment_method=v_after.payment_method,change_for_cents=v_after.change_for_cents,
    discount_cents=least(subtotal_cents,v_after.discount_cents),
    delivery_fee_cents=v_after.delivery_fee_cents,total_cents=greatest(0,subtotal_cents-least(subtotal_cents,v_after.discount_cents)+v_after.delivery_fee_cents),version=version+1,updated_at=now(),updated_by=p_actor_id where id=p_order_id;
  -- Trocou a forma de pagamento de um pedido com um único recebimento: o recebimento acompanha.
  if p_patch ? 'payment_method' and (p_patch->>'payment_method') is distinct from v_before.payment_method::text
    and (select count(*) from public.payments where order_id=p_order_id and status='paid')=1 then
    update public.payments set method=v_after.payment_method,updated_at=now() where order_id=p_order_id and status='paid';
  end if;
  if v_money then perform public.recalculate_order_totals(p_order_id); end if;
  select * into v_after from public.orders where id=p_order_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data)
    values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
      'ORDER_UPDATED','order',p_order_id,p_reason,to_jsonb(v_before),to_jsonb(v_after));
  return to_jsonb(v_after);
end $function$;

insert into public.system_migrations(version,name) values(47,'full_order_editing') on conflict(version) do nothing;

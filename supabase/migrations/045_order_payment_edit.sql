-- Editar pedido depois de feito: forma de pagamento e troco, além dos campos que já eram editáveis.
-- A forma de pagamento só muda enquanto não houver recebimento registrado.
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
  if p_patch ? 'payment_method' and (p_patch->>'payment_method') is distinct from v_before.payment_method::text
    and (v_before.payment_status in ('paid','partial','refunded') or exists(select 1 from public.payments where order_id=p_order_id and status='paid'))
  then raise exception 'Pedido com recebimento registrado não permite trocar a forma de pagamento; estorne o recebimento antes'; end if;
  v_after:=jsonb_populate_record(v_before,p_patch);
  if v_after.discount_cents<0 or v_after.delivery_fee_cents<0 or coalesce(v_after.change_for_cents,0)<0 then raise exception 'Valores inválidos'; end if;
  update public.orders set customer_name=v_after.customer_name,customer_phone=v_after.customer_phone,
    address=v_after.address,notes=v_after.notes,internal_summary=v_after.internal_summary,priority=v_after.priority,
    estimated_ready_at=v_after.estimated_ready_at,payment_method=v_after.payment_method,change_for_cents=v_after.change_for_cents,
    discount_cents=least(subtotal_cents,v_after.discount_cents),
    delivery_fee_cents=v_after.delivery_fee_cents,total_cents=greatest(0,subtotal_cents-least(subtotal_cents,v_after.discount_cents)+v_after.delivery_fee_cents),version=version+1,updated_at=now(),updated_by=p_actor_id where id=p_order_id;
  if v_money then perform public.recalculate_order_totals(p_order_id); end if;
  select * into v_after from public.orders where id=p_order_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data)
    values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
      'ORDER_UPDATED','order',p_order_id,p_reason,to_jsonb(v_before),to_jsonb(v_after));
  return to_jsonb(v_after);
end $function$;

insert into public.system_migrations(version,name) values(45,'order_payment_edit') on conflict(version) do nothing;

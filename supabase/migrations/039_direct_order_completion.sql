-- Conclusão direta sem justificativa. Mantém controle de versão, pagamento e autor do histórico.
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
  if p_status='completed' and v_old='cancelled' then raise exception 'Reabra o pedido cancelado antes de concluir'; end if;
  if p_status='cancelled' and (v_payment in ('paid','partial','refunded') or exists(select 1 from public.payments where order_id=p_order_id and status='paid') or exists(select 1 from public.tabs where id=v_tab and paid_cents>0)) then raise exception 'Pedido com recebimento exige conciliação antes do cancelamento'; end if;
  if p_status='out_for_delivery' and v_channel not in ('own_delivery','ifood','99food') then
    raise exception 'Status não permitido para o canal';
  end if;
  -- Conclusão operacional não baixa nem altera recebimento pendente.

  v_old_rank:=case v_old when 'received' then 1 when 'confirmed' then 2 when 'preparing' then 3 when 'ready' then 4 when 'out_for_delivery' then 5 when 'completed' then 6 else 7 end;
  v_new_rank:=case p_status when 'received' then 1 when 'confirmed' then 2 when 'preparing' then 3 when 'ready' then 4 when 'out_for_delivery' then 5 when 'completed' then 6 else 7 end;
  if p_status<>'completed' and (p_status='cancelled' or v_new_rank<v_old_rank or v_new_rank>v_old_rank+1) and coalesce(trim(p_reason),'')='' then
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

-- Apenas o servidor autenticado chama a função; não ampliar acesso direto via Data API.
revoke execute on function public.change_order_status_controlled(text,public.order_status,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.change_order_status_controlled(text,public.order_status,text,uuid,integer) to service_role;

insert into public.system_migrations(version,name) values(39,'direct_order_completion') on conflict(version) do nothing;

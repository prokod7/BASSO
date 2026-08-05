-- Salon completion: table grouping/separation and tab payments reflected in cash/table status.
create or replace function public.group_restaurant_tables(
  p_table_numbers integer[],
  p_actor_id uuid default auth.uid()
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_group_id uuid:=gen_random_uuid(); v_count integer;
begin
  select count(*) into v_count from unnest(p_table_numbers) as u(n) where n between 1 and 15;
  if v_count<2 or v_count<>cardinality(p_table_numbers) then raise exception 'Selecione ao menos duas mesas válidas'; end if;
  if (select count(distinct n) from unnest(p_table_numbers) as u(n))<>cardinality(p_table_numbers) then raise exception 'Mesas duplicadas'; end if;
  update public.restaurant_tables
  set group_id=v_group_id,status=case when status='free' then 'occupied' else status end,opened_at=coalesce(opened_at,now()),opened_by=coalesce(opened_by,p_actor_id),version=version+1,updated_at=now()
  where number=any(p_table_numbers);
  if not found then raise exception 'Mesas não encontradas'; end if;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'TABLES_GROUPED','table_group',v_group_id::text,jsonb_build_object('tableNumbers',p_table_numbers));
  return v_group_id;
end $$;
grant execute on function public.group_restaurant_tables(integer[],uuid) to authenticated,service_role;

create or replace function public.ungroup_restaurant_table(
  p_table_number integer,
  p_actor_id uuid default auth.uid()
) returns void
language plpgsql security definer set search_path=public as $$
declare v_group uuid;
begin
  select group_id into v_group from public.restaurant_tables where number=p_table_number for update;
  if not found then raise exception 'Mesa não encontrada'; end if;
  update public.restaurant_tables set group_id=null,version=version+1,updated_at=now() where number=p_table_number;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,before_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'TABLE_UNGROUPED','table',p_table_number::text,jsonb_build_object('groupId',v_group));
end $$;
grant execute on function public.ungroup_restaurant_table(integer,uuid) to authenticated,service_role;

create or replace function public.record_tab_payment(
  p_tab_id uuid,
  p_amount_cents integer,
  p_method public.payment_method,
  p_idempotency_key text,
  p_actor_id uuid default auth.uid()
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_tab public.tabs%rowtype; v_total integer; v_payment_id uuid; v_new_paid integer; v_session_id uuid; v_open_count integer;
begin
  if p_amount_cents<=0 then raise exception 'Valor inválido'; end if;
  select * into v_tab from public.tabs where id=p_tab_id and status in ('open','partial') for update;
  if not found then raise exception 'Comanda não encontrada'; end if;
  select coalesce(sum(o.total_cents),0) into v_total from public.orders o where o.tab_id=p_tab_id and o.status<>'cancelled';
  if v_total<=0 then raise exception 'A comanda não possui consumo para receber'; end if;
  if v_tab.paid_cents+p_amount_cents>v_total then raise exception 'Pagamento excede o saldo da comanda'; end if;
  insert into public.payments(tab_id,method,status,amount_cents,idempotency_key,created_by)
  values(p_tab_id,p_method,'paid',p_amount_cents,p_idempotency_key,p_actor_id)
  on conflict(idempotency_key) do nothing returning id into v_payment_id;
  if v_payment_id is null then return jsonb_build_object('paidCents',v_tab.paid_cents,'totalCents',v_total,'closed',v_tab.paid_cents>=v_total,'duplicate',true); end if;
  if p_method='cash' then
    select id into v_session_id from public.cash_sessions where status='open' order by opened_at desc limit 1 for update;
    if v_session_id is null then raise exception 'Abra o caixa antes de receber em dinheiro'; end if;
    insert into public.cash_movements(session_id,kind,amount_cents,reason,payment_id,created_by)
    values(v_session_id,'sale',p_amount_cents,'Pagamento da comanda '||p_tab_id::text,v_payment_id,p_actor_id);
  end if;
  v_new_paid:=v_tab.paid_cents+p_amount_cents;
  update public.tabs set paid_cents=v_new_paid,status=case when v_new_paid>=v_total then 'closed' else 'partial' end,closed_at=case when v_new_paid>=v_total then now() else null end,version=version+1,updated_at=now() where id=p_tab_id;
  if v_new_paid>=v_total then
    update public.orders set payment_status='paid',status='completed',completed_at=now(),updated_at=now() where tab_id=p_tab_id and status<>'cancelled';
    select count(*) into v_open_count from public.tabs where table_number=v_tab.table_number and status in ('open','partial');
    if v_open_count=0 then update public.restaurant_tables set status='free',people_count=null,opened_at=null,opened_by=null,group_id=null,version=version+1,updated_at=now() where number=v_tab.table_number; end if;
  else
    update public.orders set payment_status='partial',updated_at=now() where tab_id=p_tab_id and status<>'cancelled';
    update public.restaurant_tables set status='partial',version=version+1,updated_at=now() where number=v_tab.table_number;
  end if;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'TAB_PAYMENT_RECORDED','tab',p_tab_id::text,jsonb_build_object('amountCents',p_amount_cents,'method',p_method,'paidCents',v_new_paid,'totalCents',v_total));
  return jsonb_build_object('paidCents',v_new_paid,'totalCents',v_total,'closed',v_new_paid>=v_total,'paymentId',v_payment_id,'duplicate',false);
end $$;
grant execute on function public.record_tab_payment(uuid,integer,public.payment_method,text,uuid) to authenticated,service_role;

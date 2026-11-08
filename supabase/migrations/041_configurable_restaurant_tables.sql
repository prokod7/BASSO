-- 041: mesas configuráveis pelo gestor.
-- Antes: exatamente 15 mesas (números 1 a 15) com 2 ou 5 lugares, fixos no banco.
-- Agora: o gestor cadastra, edita os lugares e desativa mesas pelo painel.
-- Mesas não são apagadas (comandas e pedidos antigos as referenciam): "remover" = desativar.
begin;

alter table public.restaurant_tables drop constraint if exists restaurant_tables_number_check;
alter table public.restaurant_tables add constraint restaurant_tables_number_check check (number between 1 and 999);
alter table public.restaurant_tables drop constraint if exists restaurant_tables_capacity_check;
alter table public.restaurant_tables add constraint restaurant_tables_capacity_check check (capacity between 1 and 50);
alter table public.restaurant_tables add column if not exists active boolean not null default true;

create or replace function public.restaurant_table_available(p_number integer)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.restaurant_tables where number=p_number and active)
$$;
revoke execute on function public.restaurant_table_available(integer) from public, anon;
grant execute on function public.restaurant_table_available(integer) to authenticated, service_role;

-- Mesmas funções das migrations 038, 009 e 010; muda apenas a validação "1 a 15"
-- para "mesa cadastrada" (set_table_status também atende mesas desativadas,
-- para permitir liberar uma mesa antes de desativá-la).
create or replace function public.set_table_status(p_table_number integer,p_status text,p_people_count integer,p_actor_id uuid default auth.uid())
returns void language plpgsql security definer set search_path=public as $$
declare v_old public.restaurant_tables%rowtype; v_tab public.tabs%rowtype;
begin
  if not exists(select 1 from public.restaurant_tables where number=p_table_number) then raise exception 'Mesa inválida'; end if;
  if p_status not in ('free','occupied','cleaning','partial') then raise exception 'Status inválido'; end if;
  select * into v_old from public.restaurant_tables where number=p_table_number for update;
  if not found then raise exception 'Mesa não cadastrada'; end if;
  if p_people_count is not null and (p_people_count<0 or p_people_count>20) then raise exception 'Quantidade de pessoas inválida'; end if;
  if p_status='free' then
    for v_tab in select * from public.tabs where table_number=p_table_number and status in ('open','partial') order by id for update loop
      if v_tab.paid_cents<>0 or exists(select 1 from public.payments where tab_id=v_tab.id and status='paid')
        or exists(select 1 from public.orders where tab_id=v_tab.id and deleted_at is null and status<>'cancelled')
      then raise exception 'A mesa tem consumo ou pagamentos. Receba o saldo ou cancele a comanda com motivo antes de fechar.'; end if;
      update public.tabs set status='closed',closed_at=now(),version=version+1,updated_at=now() where id=v_tab.id;
      insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,before_data)
      values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'EMPTY_TAB_CLOSED','tab',v_tab.id::text,to_jsonb(v_tab));
    end loop;
  end if;
  update public.restaurant_tables set status=p_status,
    people_count=case when p_status='free' then null else p_people_count end,
    opened_at=case when p_status='occupied' then coalesce(opened_at,now()) when p_status='free' then null else opened_at end,
    opened_by=case when p_status='occupied' then coalesce(opened_by,p_actor_id) when p_status='free' then null else opened_by end,
    group_id=case when p_status='free' then null else group_id end,version=version+1,updated_at=now() where number=p_table_number;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'TABLE_STATUS_CHANGED','table',p_table_number::text,to_jsonb(v_old),jsonb_build_object('status',p_status,'people',p_people_count));
end $$;

create or replace function public.open_table_tab(
  p_table_number integer,
  p_name text,
  p_people_count integer,
  p_actor_id uuid default auth.uid()
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.restaurant_table_available(p_table_number) then raise exception 'Mesa inválida ou desativada'; end if;
  if length(trim(p_name))<1 then raise exception 'Nome da comanda obrigatório'; end if;
  update public.restaurant_tables set status='occupied',people_count=coalesce(p_people_count,people_count),opened_at=coalesce(opened_at,now()),opened_by=coalesce(opened_by,p_actor_id),version=version+1,updated_at=now() where number=p_table_number;
  insert into public.tabs(table_number,name,waiter_id) values(p_table_number,p_name,p_actor_id) returning id into v_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'TAB_OPENED','tab',v_id::text,jsonb_build_object('tableNumber',p_table_number,'name',p_name));
  return v_id;
end $$;

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
  if not public.restaurant_table_available(p_target_table) then raise exception 'Mesa de destino inválida ou desativada'; end if;
  update public.tabs set table_number=p_target_table,version=version+1,updated_at=now() where id=p_tab_id;
  update public.orders set table_number=p_target_table,updated_at=now() where tab_id=p_tab_id and status<>'completed';
  update public.restaurant_tables set status='occupied',opened_at=coalesce(opened_at,now()),version=version+1,updated_at=now() where number=p_target_table;
  select count(*) into v_open_count from public.tabs where table_number=v_tab.table_number and status in ('open','partial');
  if v_open_count=0 then update public.restaurant_tables set status='free',people_count=null,opened_at=null,opened_by=null,group_id=null,version=version+1,updated_at=now() where number=v_tab.table_number; end if;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'TAB_TRANSFERRED','tab',p_tab_id::text,jsonb_build_object('tableNumber',v_tab.table_number),jsonb_build_object('tableNumber',p_target_table));
end $$;

create or replace function public.group_restaurant_tables(
  p_table_numbers integer[],
  p_actor_id uuid default auth.uid()
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_group_id uuid:=gen_random_uuid(); v_count integer;
begin
  select count(*) into v_count from unnest(p_table_numbers) as u(n) where public.restaurant_table_available(n);
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

insert into public.system_migrations(version,name) values(41,'configurable_restaurant_tables') on conflict(version) do nothing;

commit;

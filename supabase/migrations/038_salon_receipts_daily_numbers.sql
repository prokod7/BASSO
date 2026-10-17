-- Daily display sequence. The permanent orders.number / orders.id remain unchanged.
lock table public.orders in share row exclusive mode;
alter table public.orders add column if not exists business_date date;
alter table public.orders add column if not exists daily_number integer;
with numbered as (
  select id, (created_at at time zone 'America/Sao_Paulo')::date as day,
    row_number() over(partition by (created_at at time zone 'America/Sao_Paulo')::date order by created_at,number,id)::integer as seq
  from public.orders
)
update public.orders o set business_date=n.day,daily_number=n.seq from numbered n
where o.id=n.id and o.daily_number is null;
alter table public.orders alter column business_date set not null;
alter table public.orders alter column daily_number set not null;
create unique index if not exists orders_business_date_daily_number_key on public.orders(business_date,daily_number);
create table if not exists private.daily_order_counters (
  business_date date primary key,
  last_number integer not null check(last_number > 0)
);
alter table private.daily_order_counters enable row level security;
revoke all on private.daily_order_counters from public,anon,authenticated;
grant usage on schema private to service_role;
grant select,insert,update on private.daily_order_counters to service_role;
insert into private.daily_order_counters(business_date,last_number)
select business_date,max(daily_number) from public.orders group by business_date
on conflict(business_date) do update set last_number=greatest(daily_order_counters.last_number,excluded.last_number);
create or replace function private.assign_daily_order_number() returns trigger
language plpgsql security invoker set search_path=public,private as $$
begin
  new.business_date := (coalesce(new.created_at,now()) at time zone 'America/Sao_Paulo')::date;
  insert into private.daily_order_counters(business_date,last_number) values(new.business_date,1)
  on conflict(business_date) do update set last_number=daily_order_counters.last_number+1
  returning last_number into new.daily_number;
  return new;
end $$;
revoke all on function private.assign_daily_order_number() from public,anon,authenticated;
grant execute on function private.assign_daily_order_number() to service_role;
drop trigger if exists orders_assign_daily_number on public.orders;
create trigger orders_assign_daily_number before insert on public.orders for each row execute function private.assign_daily_order_number();
-- Existing authorized token projection: change only its displayed number.
do $$ declare definition text; begin
  select pg_get_functiondef(oid) into definition from pg_proc
  where oid=to_regprocedure('public.get_public_order(text,text)');
  if definition is not null then
    definition := replace(definition,'''number'',v_order.number','''number'',coalesce(v_order.daily_number,v_order.number)');
    execute definition;
  end if;
end $$;

-- Empty tabs must be closable without recording a fictitious payment.
-- This RPC is called only by the authenticated server route using service_role.
create or replace function public.set_table_status(p_table_number integer,p_status text,p_people_count integer,p_actor_id uuid default auth.uid())
returns void language plpgsql security definer set search_path=public as $$
declare v_old public.restaurant_tables%rowtype; v_tab public.tabs%rowtype;
begin
  if p_table_number not between 1 and 15 then raise exception 'Mesa inválida'; end if;
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
revoke all on function public.set_table_status(integer,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.set_table_status(integer,text,integer,uuid) to service_role;

insert into public.system_migrations(version,name) values(38,'salon_receipts_daily_numbers') on conflict(version) do nothing;

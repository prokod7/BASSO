-- PedidoPro Mega Update 07 — Production Final / Basso Operations 1.0
-- Hardening de numeração interna dos pedidos para concorrência real.
-- A numeração passa a ser gerada exclusivamente pelo PostgreSQL, de forma atômica,
-- independentemente do número provisório enviado por clientes, PDV ou marketplaces.

create sequence if not exists public.order_number_seq as bigint start with 1054 increment by 1;

select setval(
  'public.order_number_seq',
  greatest(coalesce((select max(number) from public.orders), 1053), 1053),
  true
);

alter sequence public.order_number_seq owned by public.orders.number;
-- Sem DEFAULT para evitar consumir a sequência duas vezes: o trigger abaixo é a única autoridade.
alter table public.orders alter column number drop default;

create or replace function public.assign_order_number_server_side() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  -- O número recebido do navegador ou de integrações é apenas provisório.
  -- A sequência é a autoridade final e elimina colisões entre dispositivos simultâneos.
  new.number := nextval('public.order_number_seq');
  return new;
end $$;

drop trigger if exists orders_assign_number_server_side on public.orders;
create trigger orders_assign_number_server_side
  before insert on public.orders
  for each row execute function public.assign_order_number_server_side();

create index if not exists orders_status_created_at_idx
  on public.orders(status, created_at desc)
  where deleted_at is null;

create index if not exists orders_channel_created_at_idx
  on public.orders(channel, created_at desc)
  where deleted_at is null;

create index if not exists orders_driver_status_idx
  on public.orders(driver_id, status, created_at desc)
  where driver_id is not null and deleted_at is null;

insert into public.system_migrations(version,name)
values (17,'production_final_hardening')
on conflict (version) do update set name=excluded.name;

-- ---------------------------------------------------------------------------
-- Expedição: checklist persistente e liberação validada no servidor
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists expedition_checklist jsonb not null default '{}'::jsonb;

alter table public.orders
  drop constraint if exists orders_expedition_checklist_object;
alter table public.orders
  add constraint orders_expedition_checklist_object
  check (jsonb_typeof(expedition_checklist) = 'object');

create or replace function public.save_order_expedition_checklist(
  p_order_id text,
  p_checklist jsonb,
  p_actor_id uuid default auth.uid()
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_before jsonb;
  v_clean jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' and public.current_role() not in ('manager','counter','kitchen','bar') then
    raise exception 'Sem permissão para operar expedição';
  end if;
  if jsonb_typeof(coalesce(p_checklist,'{}'::jsonb)) <> 'object' then
    raise exception 'Checklist inválido';
  end if;

  -- Mantém apenas as chaves operacionais conhecidas e converte tudo para boolean.
  v_clean := jsonb_build_object(
    'items', coalesce((p_checklist->>'items')::boolean,false),
    'beverages', coalesce((p_checklist->>'beverages')::boolean,false),
    'payment', coalesce((p_checklist->>'payment')::boolean,false),
    'address', coalesce((p_checklist->>'address')::boolean,false),
    'customer', coalesce((p_checklist->>'customer')::boolean,false)
  );

  select expedition_checklist into v_before
  from public.orders where id=p_order_id and deleted_at is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;

  update public.orders
    set expedition_checklist=v_clean,
        expedition_status=case when expedition_status='pending' then 'checking' else expedition_status end,
        updated_at=now(),updated_by=p_actor_id,version=version+1
  where id=p_order_id;

  if v_before is distinct from v_clean then
    insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,before_data,after_data)
    values(
      p_actor_id,
      coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
      'ORDER_EXPEDITION_CHECKLIST_UPDATED','order',p_order_id,
      jsonb_build_object('checklist',coalesce(v_before,'{}'::jsonb)),
      jsonb_build_object('checklist',v_clean)
    );
  end if;
end $$;

create or replace function public.set_order_expedition_status_v2(
  p_order_id text,
  p_status text,
  p_notes text default null,
  p_checklist jsonb default '{}'::jsonb,
  p_actor_id uuid default auth.uid()
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_order public.orders%rowtype;
  v_clean jsonb;
  v_required_last text;
  v_unready_count integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' and public.current_role() not in ('manager','counter','kitchen','bar') then
    raise exception 'Sem permissão para operar expedição';
  end if;
  if p_status not in ('pending','checking','approved','returned') then
    raise exception 'Status inválido';
  end if;
  if jsonb_typeof(coalesce(p_checklist,'{}'::jsonb)) <> 'object' then
    raise exception 'Checklist inválido';
  end if;
  if p_status='returned' and length(trim(coalesce(p_notes,'')))<2 then
    raise exception 'Informe o motivo da devolução para a produção';
  end if;

  select * into v_order from public.orders where id=p_order_id and deleted_at is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;

  v_clean := jsonb_build_object(
    'items', coalesce((p_checklist->>'items')::boolean,false),
    'beverages', coalesce((p_checklist->>'beverages')::boolean,false),
    'payment', coalesce((p_checklist->>'payment')::boolean,false),
    'address', coalesce((p_checklist->>'address')::boolean,false),
    'customer', coalesce((p_checklist->>'customer')::boolean,false)
  );

  if p_status='approved' then
    v_required_last := case when v_order.channel='own_delivery' then 'address' else 'customer' end;
    if not coalesce((v_clean->>'items')::boolean,false)
       or not coalesce((v_clean->>'beverages')::boolean,false)
       or not coalesce((v_clean->>'payment')::boolean,false)
       or not coalesce((v_clean->>v_required_last)::boolean,false) then
      raise exception 'Conclua todas as conferências antes de liberar o pedido';
    end if;

    select count(*) into v_unready_count
    from public.order_items
    where order_id=p_order_id and production_status not in ('ready','cancelled');
    if v_unready_count>0 then
      raise exception 'Ainda existem itens que não estão prontos para expedição';
    end if;

    if v_order.status not in ('ready','preparing') then
      raise exception 'Pedido não está em uma etapa válida para liberação';
    end if;
  end if;

  update public.orders
  set expedition_status=p_status,
      expedition_notes=nullif(trim(coalesce(p_notes,'')),''),
      expedition_checklist=v_clean,
      expedition_checked_by=case when p_status='approved' then p_actor_id else null end,
      expedition_checked_at=case when p_status='approved' then now() else null end,
      updated_at=now(),updated_by=p_actor_id,version=version+1
  where id=p_order_id;

  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data)
  values(
    p_actor_id,
    coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
    'ORDER_EXPEDITION_CHANGED','order',p_order_id,p_notes,
    jsonb_build_object('status',v_order.expedition_status,'checklist',coalesce(v_order.expedition_checklist,'{}'::jsonb)),
    jsonb_build_object('status',p_status,'checklist',v_clean)
  );
end $$;

grant execute on function public.save_order_expedition_checklist(text,jsonb,uuid) to authenticated,service_role;
grant execute on function public.set_order_expedition_status_v2(text,text,text,jsonb,uuid) to authenticated,service_role;

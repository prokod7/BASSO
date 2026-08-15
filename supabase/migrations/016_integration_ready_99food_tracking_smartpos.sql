-- PedidoPro Mega Update 06
-- Integration Ready: 99Food contract-first, observability, dual-level driver tracking,
-- and SmartPOS/Laranjinha foundations without changing the working iFood contract.

create table if not exists public.system_migrations (
  version integer primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

-- Integration observability. No secrets are stored here.
alter table public.integration_events add column if not exists external_order_id text;
alter table public.integration_events add column if not exists correlation_id text;
alter table public.integration_events add column if not exists last_http_status integer;
alter table public.integration_events add column if not exists updated_at timestamptz not null default now();
create index if not exists integration_events_provider_status_created_idx
  on public.integration_events(provider,status,created_at desc);
create index if not exists integration_events_external_order_idx
  on public.integration_events(provider,external_order_id)
  where external_order_id is not null;
create index if not exists integration_events_correlation_idx
  on public.integration_events(correlation_id)
  where correlation_id is not null;

alter table public.integration_connections add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.integration_connections add column if not exists last_success_at timestamptz;
alter table public.integration_connections add column if not exists last_error_at timestamptz;
alter table public.integration_connections add column if not exists last_error_message text;


-- Extend the provider registry for the next integrations without changing existing rows.
alter table public.integration_connections drop constraint if exists integration_connections_provider_check;
alter table public.integration_connections add constraint integration_connections_provider_check
  check (provider in ('ifood','99food','rede','onesignal','printer','fiscal','tracking','laranjinha'));

-- Keep the existing queue semantics while recording the last mutation timestamp.
create or replace function public.finish_integration_event(
  p_id uuid,
  p_success boolean,
  p_error text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare v_attempts integer;
begin
  select attempts into v_attempts from public.integration_events where id=p_id for update;
  if not found then raise exception 'Evento não encontrado'; end if;
  update public.integration_events
  set status=case when p_success then 'done' when v_attempts>=8 then 'dead_letter' else 'failed' end,
      last_error=case when p_success then null else left(coalesce(p_error,'Falha desconhecida'),2000) end,
      next_attempt_at=case when p_success or v_attempts>=8 then null else now() + make_interval(secs => least(3600, power(2,v_attempts)::integer * 15)) end,
      processed_at=case when p_success then now() else processed_at end,
      claimed_at=null,
      updated_at=now()
  where id=p_id;
end $$;

grant execute on function public.finish_integration_event(uuid,boolean,text) to service_role;

-- Dual-level tracking: the public customer link belongs to an order; internal tracking
-- belongs to the driver's active shift and may continue after that order is delivered.
create table if not exists public.driver_shifts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  started_by uuid references public.profiles(id),
  ended_by uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active','ended')),
  created_at timestamptz not null default now()
);
create unique index if not exists driver_shifts_one_active_idx
  on public.driver_shifts(driver_id) where status='active';
create index if not exists driver_shifts_driver_started_idx
  on public.driver_shifts(driver_id,started_at desc);

alter table public.driver_locations alter column order_id drop not null;
alter table public.driver_locations add column if not exists shift_id uuid references public.driver_shifts(id) on delete set null;
alter table public.driver_locations add column if not exists speed numeric(10,2);
alter table public.driver_locations add column if not exists heading numeric(10,2);
create index if not exists driver_locations_driver_captured_idx on public.driver_locations(driver_id,captured_at desc);
create index if not exists driver_locations_shift_captured_idx on public.driver_locations(shift_id,captured_at desc) where shift_id is not null;

alter table public.tracking_tokens add column if not exists customer_visible boolean not null default true;
alter table public.tracking_tokens add column if not exists delivered_at timestamptz;


create or replace function public.sync_customer_tracking_visibility() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('completed','cancelled') and old.status is distinct from new.status then
    update public.tracking_tokens
       set customer_visible=false,
           delivered_at=case when new.status='completed' then coalesce(delivered_at,now()) else delivered_at end,
           revoked_at=coalesce(revoked_at,now())
     where order_id=new.id;
  end if;
  return new;
end $$;

drop trigger if exists orders_customer_tracking_visibility on public.orders;
create trigger orders_customer_tracking_visibility
  after update of status on public.orders
  for each row execute function public.sync_customer_tracking_visibility();

create or replace function public.start_driver_shift(
  p_driver_id uuid,
  p_actor_id uuid default auth.uid()
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_shift uuid;
begin
  if not exists(select 1 from public.drivers where id=p_driver_id and active) then
    raise exception 'Motoboy não encontrado ou inativo';
  end if;
  select id into v_shift from public.driver_shifts where driver_id=p_driver_id and status='active' limit 1;
  if v_shift is not null then return v_shift; end if;
  insert into public.driver_shifts(driver_id,started_by) values(p_driver_id,p_actor_id) returning id into v_shift;
  update public.drivers set shift_started_at=now(),shift_ended_at=null,updated_at=now() where id=p_driver_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'DRIVER_SHIFT_STARTED','driver',p_driver_id::text,jsonb_build_object('shiftId',v_shift));
  return v_shift;
end $$;

create or replace function public.end_driver_shift(
  p_driver_id uuid,
  p_actor_id uuid default auth.uid()
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_shift uuid;
begin
  select id into v_shift from public.driver_shifts where driver_id=p_driver_id and status='active' for update;
  if v_shift is null then return false; end if;
  if exists(select 1 from public.drivers where id=p_driver_id and active_order_id is not null) then
    raise exception 'Finalize ou transfira a entrega ativa antes de encerrar o turno';
  end if;
  update public.driver_shifts set status='ended',ended_at=now(),ended_by=p_actor_id where id=v_shift;
  update public.drivers set shift_ended_at=now(),updated_at=now() where id=p_driver_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'DRIVER_SHIFT_ENDED','driver',p_driver_id::text,jsonb_build_object('shiftId',v_shift));
  return true;
end $$;

create or replace function public.record_driver_location_v2(
  p_driver_id uuid,
  p_order_id text,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric,
  p_speed numeric,
  p_heading numeric,
  p_captured_at timestamptz
) returns void
language plpgsql security definer set search_path=public as $$
declare v_shift uuid;
begin
  select id into v_shift from public.driver_shifts where driver_id=p_driver_id and status='active' limit 1;
  if v_shift is null then raise exception 'Turno do motoboy não está ativo'; end if;
  if not exists(select 1 from public.drivers where id=p_driver_id and active) then raise exception 'Motoboy inativo'; end if;
  if p_order_id is not null then
    if not exists(select 1 from public.drivers where id=p_driver_id and active_order_id=p_order_id) then raise exception 'Entrega não atribuída ao motoboy'; end if;
    if not exists(select 1 from public.orders where id=p_order_id and status='out_for_delivery') then raise exception 'Pedido não está em entrega ativa'; end if;
  end if;
  insert into public.driver_locations(driver_id,order_id,shift_id,latitude,longitude,accuracy,speed,heading,captured_at)
  values(p_driver_id,p_order_id,v_shift,p_latitude,p_longitude,p_accuracy,p_speed,p_heading,p_captured_at);
  update public.drivers
     set last_latitude=p_latitude,last_longitude=p_longitude,last_accuracy=p_accuracy,last_location_at=p_captured_at,updated_at=now()
   where id=p_driver_id;
  delete from public.driver_locations where driver_id=p_driver_id and captured_at < now()-interval '24 hours';
end $$;

create or replace function public.get_public_tracking(p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_driver public.drivers%rowtype;
begin
  select o.* into v_order
    from public.tracking_tokens t
    join public.orders o on o.id=t.order_id
   where t.token_hash=encode(digest(p_token,'sha256'),'hex')
     and t.revoked_at is null
     and t.expires_at>now()
     and t.customer_visible=true;
  if not found then return null; end if;
  if v_order.driver_id is not null then select * into v_driver from public.drivers where id=v_order.driver_id; end if;
  return jsonb_build_object(
    'orderId',v_order.id,
    'number',v_order.number,
    'status',v_order.status,
    'updatedAt',v_order.updated_at,
    'destination',jsonb_build_object('latitude',v_order.address->'latitude','longitude',v_order.address->'longitude'),
    'driver',case when v_driver.id is null then null else jsonb_build_object('latitude',v_driver.last_latitude,'longitude',v_driver.last_longitude,'lastLocationAt',v_driver.last_location_at) end
  );
end $$;

-- SmartPOS/Laranjinha-ready device registry. No Rede API is assumed here.
create table if not exists public.registered_devices (
  id uuid primary key default gen_random_uuid(),
  device_key text not null unique,
  device_type text not null check (device_type in ('desktop','tablet','waiter_smartpos','driver_phone','kds','other')),
  provider text,
  serial text,
  label text not null,
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists registered_devices_type_active_idx on public.registered_devices(device_type,active);

alter table public.payments add column if not exists nsu text;
alter table public.payments add column if not exists provider_transaction_id text;
alter table public.payments add column if not exists device_id uuid references public.registered_devices(id) on delete set null;
create index if not exists payments_provider_transaction_idx on public.payments(provider,provider_transaction_id) where provider_transaction_id is not null;

insert into public.feature_flags(key,label,description,enabled,requires_integration) values
  ('internal_driver_tracking','Rastreamento interno de motoboys','Mantém a posição do motoboy visível à pizzaria durante o turno ativo.',false,false),
  ('customer_delivery_tracking','Rastreamento do cliente','Expõe apenas a entrega atual por token temporário e encerra o acesso ao concluir.',false,false),
  ('laranjinha_smart','Laranjinha Smart','Integração futura homologada com a Smart Store/SDK oficial.',false,true),
  ('smartpos_waiter','Garçom SmartPOS','Modo do garçom preparado para maquininha Android homologada.',false,true)
on conflict (key) do update set
  label=excluded.label,
  description=excluded.description,
  requires_integration=excluded.requires_integration;

alter table public.driver_shifts enable row level security;
alter table public.registered_devices enable row level security;

drop policy if exists driver_shifts_operation on public.driver_shifts;
create policy driver_shifts_operation on public.driver_shifts for select to authenticated
  using (public.current_role() in ('manager','counter','driver','viewer'));
drop policy if exists registered_devices_manager on public.registered_devices;
create policy registered_devices_manager on public.registered_devices for select to authenticated
  using (public.current_role() in ('manager','viewer'));

grant select on public.driver_shifts to authenticated,service_role;
grant all on public.driver_shifts,public.registered_devices to service_role;
grant execute on function public.start_driver_shift(uuid,uuid) to authenticated,service_role;
grant execute on function public.end_driver_shift(uuid,uuid) to authenticated,service_role;
grant execute on function public.record_driver_location_v2(uuid,text,numeric,numeric,numeric,numeric,numeric,timestamptz) to authenticated,service_role;
grant execute on function public.get_public_tracking(text) to anon,authenticated;

insert into public.system_migrations(version,name)
values (16,'integration_ready_99food_tracking_smartpos')
on conflict (version) do update set name=excluded.name;

-- PedidoPro 9.0.0 — Final Homologation
-- Robustez operacional, telemetria segura de erros e fluxo móvel do garçom.

insert into public.system_migrations(version, name)
values (19, 'final_homologation')
on conflict (version) do update set name = excluded.name;

-- ---------------------------------------------------------------------------
-- 1. Salão: registrar que o pedido foi servido sem encerrar a comanda.
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists served_at timestamptz;

create index if not exists orders_active_status_created_idx
  on public.orders(status, created_at desc)
  where deleted_at is null and status in ('received','confirmed','preparing','ready','out_for_delivery');

create index if not exists orders_delivery_driver_status_idx
  on public.orders(driver_id, status, created_at desc)
  where deleted_at is null and channel = 'own_delivery';

create index if not exists orders_table_active_idx
  on public.orders(table_number, tab_id, created_at desc)
  where deleted_at is null and channel in ('dine_in','table_qr');

create index if not exists order_items_order_sector_idx
  on public.order_items(order_id, sector);

-- ---------------------------------------------------------------------------
-- 2. Telemetria segura de erros do cliente/painel.
-- Nunca armazenar senha, token ou payload completo de requisição nesta tabela.
-- A rota server-side é responsável por redigir segredos antes da gravação.
-- ---------------------------------------------------------------------------
create table if not exists public.client_error_events (
  id uuid primary key default gen_random_uuid(),
  error_id text not null,
  route text,
  message text not null,
  stack text,
  digest text,
  app_version text,
  user_agent text,
  online boolean,
  user_id uuid references auth.users(id) on delete set null,
  user_role text,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

create unique index if not exists client_error_events_error_id_idx
  on public.client_error_events(error_id);
create index if not exists client_error_events_created_idx
  on public.client_error_events(created_at desc);
create index if not exists client_error_events_route_created_idx
  on public.client_error_events(route, created_at desc);
create index if not exists client_error_events_open_idx
  on public.client_error_events(created_at desc)
  where resolved_at is null;

alter table public.client_error_events enable row level security;

-- O navegador não grava diretamente nesta tabela. Toda escrita/leitura passa
-- por Route Handler autenticado usando o service role do servidor.
revoke all on table public.client_error_events from anon;
revoke all on table public.client_error_events from authenticated;
grant all on table public.client_error_events to service_role;

-- ---------------------------------------------------------------------------
-- 3. Auditoria explícita para marcação de servido.
-- ---------------------------------------------------------------------------
create or replace function public.mark_order_served(
  p_order_id text,
  p_actor_id uuid default auth.uid()
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_served_at timestamptz;
begin
  select * into v_order
  from public.orders
  where id = p_order_id and deleted_at is null
  for update;

  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.channel not in ('dine_in','table_qr') then raise exception 'Somente pedidos do salão podem ser marcados como servidos'; end if;
  if v_order.status <> 'ready' then raise exception 'O pedido precisa estar pronto antes de ser marcado como servido'; end if;
  if v_order.served_at is not null then return v_order.served_at; end if;

  v_served_at := now();
  update public.orders
    set served_at = v_served_at, updated_at = v_served_at, version = coalesce(version, 1) + 1
    where id = p_order_id;

  insert into public.audit_logs(actor_id, actor_label, action, entity_type, entity_id, after_data)
  values(
    p_actor_id,
    coalesce((select display_name from public.profiles where id = p_actor_id), 'Sistema'),
    'ORDER_SERVED',
    'order',
    p_order_id,
    jsonb_build_object('servedAt', v_served_at, 'tableNumber', v_order.table_number, 'number', v_order.number)
  );

  return v_served_at;
end $$;

grant execute on function public.mark_order_served(text, uuid) to authenticated, service_role;

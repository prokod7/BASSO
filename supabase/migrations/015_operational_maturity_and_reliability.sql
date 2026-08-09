-- PedidoPro Mega Update 05
-- Maturidade operacional, locks de edição, feature flags, snapshots,
-- inventário assistido, segurança de senhas e observabilidade.

create table if not exists public.system_migrations (
  version integer primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

alter table public.profiles add column if not exists password_changed_at timestamptz;
alter table public.profiles add column if not exists last_device_label text;

alter table public.customers add column if not exists tags text[] not null default '{}';
alter table public.customers add column if not exists blocked_at timestamptz;
alter table public.customers add column if not exists blocked_reason text;

create table if not exists public.feature_flags (
  key text primary key,
  label text not null,
  description text not null default '',
  enabled boolean not null default false,
  requires_integration boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.feature_flags(key,label,description,enabled,requires_integration) values
  ('advanced_tracking','Rastreamento avançado','Rastreamento do motoboy durante a entrega ativa.',false,true),
  ('ifood','iFood','Recebimento e atualização de pedidos pela integração oficial.',false,true),
  ('food99','99Food','Recebimento e atualização de pedidos pela integração disponível.',false,true),
  ('automatic_pix','Pix automático','Confirmação automática de Pix por provedor homologado.',false,true),
  ('push_notifications','Push','Notificações push para clientes e equipe.',false,true),
  ('print_bridge','Print Bridge','Agente local de impressão com confirmação física.',false,true),
  ('expedition_required','Expedição obrigatória','Exige conferência da expedição antes da liberação.',true,false),
  ('guided_opening','Abertura guiada','Checklist de abertura operacional.',true,false),
  ('guided_closing','Fechamento guiado','Checklist de fechamento operacional.',true,false),
  ('order_edit_lock','Bloqueio de edição de pedidos','Evita sobrescrita silenciosa entre dois operadores.',true,false)
on conflict (key) do update set
  label=excluded.label,
  description=excluded.description,
  requires_integration=excluded.requires_integration;

create table if not exists public.order_edit_locks (
  order_id text primary key references public.orders(id) on delete cascade,
  holder_id uuid references public.profiles(id) on delete cascade,
  holder_label text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists order_edit_locks_expiry_idx on public.order_edit_locks(expires_at);

create table if not exists public.configuration_snapshots (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  scope text not null default 'business_settings',
  payload jsonb not null,
  created_by uuid references public.profiles(id),
  created_by_label text,
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid references public.profiles(id)
);
create index if not exists configuration_snapshots_created_idx on public.configuration_snapshots(created_at desc);

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open' check (status in ('open','completed','cancelled')),
  started_by uuid references public.profiles(id),
  completed_by uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text check (char_length(notes) <= 2000)
);

create table if not exists public.inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.inventory_counts(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  system_quantity numeric(12,3) not null,
  counted_quantity numeric(12,3),
  difference numeric(12,3) generated always as (coalesce(counted_quantity, system_quantity) - system_quantity) stored,
  note text check (char_length(note) <= 500),
  unique(count_id, inventory_item_id)
);
create index if not exists inventory_count_items_count_idx on public.inventory_count_items(count_id);

create table if not exists public.system_error_events (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'error' check (severity in ('info','warning','error','critical')),
  source text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id text,
  route text,
  actor_id uuid references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists system_error_events_status_idx on public.system_error_events(status,severity,created_at desc);

create table if not exists public.scheduled_catalog_changes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('pizza_flavor','product','addon')),
  entity_id text not null,
  change_type text not null check (change_type in ('price','availability')),
  payload jsonb not null,
  applies_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','applied','cancelled','failed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  error_message text
);
create index if not exists scheduled_catalog_changes_due_idx on public.scheduled_catalog_changes(status,applies_at);

create or replace function public.acquire_order_edit_lock(
  p_order_id text,
  p_holder_id uuid,
  p_holder_label text,
  p_ttl_seconds integer default 180
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_lock public.order_edit_locks%rowtype;
  v_now timestamptz := now();
  v_expires timestamptz := now() + make_interval(secs => greatest(30, least(600, p_ttl_seconds)));
begin
  select * into v_lock from public.order_edit_locks where order_id=p_order_id for update;
  if not found or v_lock.expires_at <= v_now or v_lock.holder_id = p_holder_id then
    insert into public.order_edit_locks(order_id,holder_id,holder_label,acquired_at,expires_at,updated_at)
    values(p_order_id,p_holder_id,p_holder_label,v_now,v_expires,v_now)
    on conflict (order_id) do update set
      holder_id=excluded.holder_id,
      holder_label=excluded.holder_label,
      acquired_at=case when public.order_edit_locks.holder_id=excluded.holder_id then public.order_edit_locks.acquired_at else excluded.acquired_at end,
      expires_at=excluded.expires_at,
      updated_at=excluded.updated_at;
    return jsonb_build_object('acquired',true,'holderId',p_holder_id,'holderLabel',p_holder_label,'expiresAt',v_expires);
  end if;
  return jsonb_build_object('acquired',false,'holderId',v_lock.holder_id,'holderLabel',v_lock.holder_label,'expiresAt',v_lock.expires_at);
end $$;

create or replace function public.release_order_edit_lock(
  p_order_id text,
  p_holder_id uuid,
  p_force boolean default false
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_deleted integer;
begin
  delete from public.order_edit_locks
   where order_id=p_order_id and (holder_id=p_holder_id or p_force=true);
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end $$;

create or replace function public.start_inventory_count(p_actor_id uuid default null)
returns uuid
language plpgsql security definer set search_path=public as $$
declare v_count uuid;
begin
  insert into public.inventory_counts(started_by) values(p_actor_id) returning id into v_count;
  insert into public.inventory_count_items(count_id,inventory_item_id,system_quantity)
  select v_count,id,quantity from public.inventory_items;
  return v_count;
end $$;

create or replace function public.complete_inventory_count(
  p_count_id uuid,
  p_actor_id uuid default null,
  p_reason text default 'Inventário físico'
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_item record;
  v_count_status text;
  v_adjustments integer := 0;
begin
  select status into v_count_status
    from public.inventory_counts
   where id=p_count_id
   for update;
  if v_count_status is distinct from 'open' then
    raise exception 'Inventário não está aberto';
  end if;
  if exists(select 1 from public.inventory_count_items where count_id=p_count_id and counted_quantity is null) then
    raise exception 'Informe a quantidade contada de todos os itens';
  end if;
  for v_item in
    select ici.*, ii.quantity current_quantity
      from public.inventory_count_items ici
      join public.inventory_items ii on ii.id=ici.inventory_item_id
     where ici.count_id=p_count_id
  loop
    if v_item.counted_quantity <> v_item.current_quantity then
      insert into public.inventory_movements(inventory_item_id,kind,delta,reason,created_by,idempotency_key)
      values(v_item.inventory_item_id,'adjustment',v_item.counted_quantity-v_item.current_quantity,p_reason,p_actor_id,'inventory_count:'||p_count_id::text||':'||v_item.inventory_item_id::text)
      on conflict (idempotency_key) do nothing;
      update public.inventory_items
         set quantity=v_item.counted_quantity,version=version+1,updated_at=now()
       where id=v_item.inventory_item_id;
      v_adjustments:=v_adjustments+1;
    end if;
  end loop;
  update public.inventory_counts set status='completed',completed_by=p_actor_id,completed_at=now() where id=p_count_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'INVENTORY_COUNT_COMPLETED','inventory_count',p_count_id::text,p_reason,jsonb_build_object('adjustments',v_adjustments));
  return jsonb_build_object('completed',true,'adjustments',v_adjustments);
end $$;

alter table public.feature_flags enable row level security;
alter table public.order_edit_locks enable row level security;
alter table public.configuration_snapshots enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_items enable row level security;
alter table public.system_error_events enable row level security;
alter table public.scheduled_catalog_changes enable row level security;

drop policy if exists feature_flags_read on public.feature_flags;
create policy feature_flags_read on public.feature_flags for select to authenticated using (true);
drop policy if exists order_edit_locks_read on public.order_edit_locks;
create policy order_edit_locks_read on public.order_edit_locks for select to authenticated using (true);
drop policy if exists configuration_snapshots_manager on public.configuration_snapshots;
create policy configuration_snapshots_manager on public.configuration_snapshots for select to authenticated using (public.current_role() in ('manager','viewer'));
drop policy if exists inventory_counts_read on public.inventory_counts;
create policy inventory_counts_read on public.inventory_counts for select to authenticated using (public.current_role() in ('manager','counter','finance','viewer'));
drop policy if exists inventory_count_items_read on public.inventory_count_items;
create policy inventory_count_items_read on public.inventory_count_items for select to authenticated using (public.current_role() in ('manager','counter','finance','viewer'));
drop policy if exists system_error_events_read on public.system_error_events;
create policy system_error_events_read on public.system_error_events for select to authenticated using (public.current_role() in ('manager','viewer'));
drop policy if exists scheduled_catalog_changes_read on public.scheduled_catalog_changes;
create policy scheduled_catalog_changes_read on public.scheduled_catalog_changes for select to authenticated using (public.current_role() in ('manager','counter','viewer'));

grant select on public.feature_flags,public.order_edit_locks,public.configuration_snapshots,public.inventory_counts,public.inventory_count_items,public.system_error_events,public.scheduled_catalog_changes to authenticated,service_role;
grant all on public.feature_flags,public.order_edit_locks,public.configuration_snapshots,public.inventory_counts,public.inventory_count_items,public.system_error_events,public.scheduled_catalog_changes to service_role;
grant execute on function public.acquire_order_edit_lock(text,uuid,text,integer) to authenticated,service_role;
grant execute on function public.release_order_edit_lock(text,uuid,boolean) to authenticated,service_role;
grant execute on function public.start_inventory_count(uuid) to authenticated,service_role;
grant execute on function public.complete_inventory_count(uuid,uuid,text) to authenticated,service_role;

insert into public.system_migrations(version,name)
values (15,'operational_maturity_and_reliability')
on conflict (version) do update set name=excluded.name;

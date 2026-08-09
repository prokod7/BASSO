-- PedidoPro Mega Update 04
-- Autonomia operacional, rotinas de abertura/fechamento, tarefas, aprovações,
-- notificações internas, expedição, perfis de impressão e diagnóstico.

create table if not exists public.system_migrations (
  version integer primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists preferred_view jsonb not null default '{}'::jsonb;

alter table public.store_runtime_status add column if not exists active_channels public.order_channel[] not null
  default array['own_delivery','pickup','counter','dine_in','table_qr']::public.order_channel[];
alter table public.store_runtime_status add column if not exists preparation_minutes integer not null default 45
  check (preparation_minutes between 5 and 240);
alter table public.store_runtime_status add column if not exists delivery_minutes integer not null default 60
  check (delivery_minutes between 10 and 300);
alter table public.store_runtime_status add column if not exists temporary_until timestamptz;
alter table public.store_runtime_status add column if not exists public_message text check (char_length(public_message) <= 500);

alter table public.orders add column if not exists expedition_status text not null default 'pending'
  check (expedition_status in ('pending','checking','approved','returned'));
alter table public.orders add column if not exists expedition_checked_by uuid references public.profiles(id);
alter table public.orders add column if not exists expedition_checked_at timestamptz;
alter table public.orders add column if not exists expedition_notes text check (char_length(expedition_notes) <= 1000);

alter table public.drivers add column if not exists plate text;
alter table public.drivers add column if not exists daily_rate_cents integer not null default 0 check (daily_rate_cents >= 0);
alter table public.drivers add column if not exists per_delivery_cents integer not null default 0 check (per_delivery_cents >= 0);
alter table public.drivers add column if not exists shift_started_at timestamptz;
alter table public.drivers add column if not exists shift_ended_at timestamptz;
alter table public.drivers add column if not exists notes text check (char_length(notes) <= 1000);

create table if not exists public.operational_checklist_templates (
  id text primary key,
  phase text not null check (phase in ('opening','closing')),
  title text not null,
  description text not null default '',
  sort_order integer not null default 0,
  required boolean not null default true,
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operational_checklist_runs (
  id uuid primary key default gen_random_uuid(),
  phase text not null check (phase in ('opening','closing')),
  business_date date not null default current_date,
  status text not null default 'in_progress' check (status in ('in_progress','completed','cancelled')),
  started_by uuid references public.profiles(id),
  completed_by uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  notes text check (char_length(notes) <= 2000)
);
create index if not exists checklist_runs_date_idx on public.operational_checklist_runs(business_date,phase,started_at desc);

create table if not exists public.operational_checklist_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.operational_checklist_runs(id) on delete cascade,
  template_id text not null references public.operational_checklist_templates(id),
  title_snapshot text not null,
  description_snapshot text not null default '',
  required boolean not null default true,
  sort_order integer not null default 0,
  status text not null default 'pending' check (status in ('pending','done','skipped','blocked')),
  note text check (char_length(note) <= 1000),
  completed_by uuid references public.profiles(id),
  completed_by_label text,
  completed_at timestamptz,
  unique(run_id,template_id)
);
create index if not exists checklist_items_run_idx on public.operational_checklist_run_items(run_id,sort_order);

insert into public.operational_checklist_templates(id,phase,title,description,sort_order,required) values
  ('opening_cash','opening','Confirmar abertura do caixa','Abra o caixa e confira o valor inicial antes de receber pedidos.',10,true),
  ('opening_printers','opening','Conferir impressoras','Verifique papel, conexão, filas e impressão de teste da cozinha e do balcão.',20,true),
  ('opening_network','opening','Conferir internet e sincronização','Confirme conexão com Supabase e funcionamento dos dispositivos operacionais.',30,true),
  ('opening_kitchen','opening','Confirmar cozinha e bar','Confirme que os setores estão prontos e com responsáveis definidos.',40,true),
  ('opening_drivers','opening','Confirmar motoboys disponíveis','Registre os motoboys do turno e a disponibilidade inicial.',50,false),
  ('opening_stock','opening','Conferir bebidas e sobremesas','Revise itens abaixo do mínimo e produtos esgotados.',60,true),
  ('opening_payments','opening','Conferir formas de pagamento','Valide Pix manual, dinheiro, débito, crédito e vales aceitos.',70,true),
  ('opening_eta','opening','Definir tempos estimados','Ajuste os tempos de preparo e entrega para o fluxo previsto.',80,true),
  ('opening_menu','opening','Abrir o cardápio','Confirme canais ativos e abra a loja para novos pedidos.',90,true),
  ('closing_orders','closing','Concluir pedidos pendentes','Revise pedidos ativos, cancelados e pagamentos ainda pendentes.',10,true),
  ('closing_tables','closing','Fechar mesas e comandas','Confirme que não existem mesas ocupadas ou comandas abertas.',20,true),
  ('closing_deliveries','closing','Concluir entregas','Verifique motoboys, entregas em andamento e ocorrências.',30,true),
  ('closing_print','closing','Resolver falhas de impressão','Reprocesse ou justifique filas com falha.',40,false),
  ('closing_stock','closing','Conferir estoque restrito','Registre perdas, entradas e divergências de bebidas e sobremesas.',50,true),
  ('closing_cash','closing','Fechar e conferir o caixa','Conte os valores, informe divergências e finalize a sessão.',60,true),
  ('closing_report','closing','Gerar resumo do expediente','Revise vendas, pagamentos, cancelamentos, descontos e despesas.',70,true),
  ('closing_store','closing','Fechar a loja','Bloqueie novos pedidos e finalize a rotina operacional.',80,true)
on conflict (id) do update set
  title=excluded.title,description=excluded.description,sort_order=excluded.sort_order,
  required=excluded.required,active=true,updated_at=now();

create table if not exists public.operation_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 180),
  description text not null default '' check (char_length(description) <= 3000),
  source_type text,
  source_id text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','blocked','completed','cancelled')),
  assigned_to uuid references public.profiles(id),
  due_at timestamptz,
  created_by uuid references public.profiles(id),
  completed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists operation_tasks_status_idx on public.operation_tasks(status,priority,due_at);
create index if not exists operation_tasks_assignee_idx on public.operation_tasks(assigned_to,status);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  entity_type text not null,
  entity_id text not null,
  reason text not null check (char_length(trim(reason)) between 2 and 1000),
  requested_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','cancelled')),
  requested_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  expires_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  one_time_token_hash text
);
create index if not exists approval_requests_status_idx on public.approval_requests(status,requested_at desc);
create index if not exists approval_requests_entity_idx on public.approval_requests(entity_type,entity_id);

create table if not exists public.internal_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id) on delete cascade,
  audience_role public.app_role,
  category text not null default 'operation',
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  title text not null check (char_length(trim(title)) between 2 and 180),
  body text not null default '' check (char_length(body) <= 2000),
  href text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists internal_notifications_recipient_idx on public.internal_notifications(recipient_id,read_at,created_at desc);
create index if not exists internal_notifications_role_idx on public.internal_notifications(audience_role,read_at,created_at desc);

create table if not exists public.system_health_checks (
  key text primary key,
  status text not null check (status in ('operational','warning','error','unknown')),
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  checked_by uuid references public.profiles(id)
);

create table if not exists public.print_profiles (
  key text primary key,
  name text not null,
  manufacturer text,
  model text,
  width_mm integer not null default 80 check (width_mm in (58,80)),
  paper_columns integer not null default 42 check (paper_columns between 24 and 64),
  connection_type text not null default 'usb' check (connection_type in ('usb','network','wifi','bluetooth','system')),
  connection_config jsonb not null default '{}'::jsonb,
  sector text not null default 'kitchen',
  auto_print boolean not null default false,
  copies integer not null default 1 check (copies between 1 and 5),
  active boolean not null default true,
  template jsonb not null default '{"fontSize":"normal","showLogo":false,"showCustomer":true,"showPayment":true,"showAddress":true,"highlightNotes":true,"highlightRemovals":true,"blockOrder":["header","customer","items","payment","address","notes"]}'::jsonb,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.print_profiles(key,name,manufacturer,model,width_mm,paper_columns,connection_type,sector,auto_print,copies) values
  ('kitchen-main','Cozinha principal','Epson','A definir',80,42,'usb','kitchen',false,1),
  ('counter-main','Balcão / expedição','Genérica','Impressora chinesa',58,32,'usb','counter',false,1)
on conflict (key) do nothing;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  supplier_id uuid references public.suppliers(id),
  status text not null default 'draft' check (status in ('draft','ordered','partially_received','received','cancelled')),
  expected_at date,
  total_cents integer not null default 0 check (total_cents >= 0),
  notes text,
  created_by uuid references public.profiles(id),
  received_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  received_at timestamptz
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id text not null references public.products(id),
  ordered_quantity numeric(12,3) not null check (ordered_quantity > 0),
  received_quantity numeric(12,3) not null default 0 check (received_quantity >= 0),
  unit_cost_cents integer not null default 0 check (unit_cost_cents >= 0),
  expires_at date,
  unique(purchase_order_id,product_id)
);

create or replace function public.start_operational_checklist(
  p_phase text,
  p_actor_id uuid default auth.uid()
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_run_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' and public.current_role() not in ('manager','counter','finance') then raise exception 'Sem permissão para iniciar rotina'; end if;
  if p_phase not in ('opening','closing') then raise exception 'Fase inválida'; end if;
  select id into v_run_id from public.operational_checklist_runs
   where phase=p_phase and business_date=current_date and status='in_progress'
   order by started_at desc limit 1;
  if v_run_id is not null then return v_run_id; end if;

  insert into public.operational_checklist_runs(phase,business_date,started_by)
  values(p_phase,current_date,p_actor_id) returning id into v_run_id;

  insert into public.operational_checklist_run_items(run_id,template_id,title_snapshot,description_snapshot,required,sort_order)
  select v_run_id,id,title,description,required,sort_order
    from public.operational_checklist_templates
   where phase=p_phase and active
   order by sort_order;

  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
    'OPERATIONAL_CHECKLIST_STARTED','checklist_run',v_run_id::text,jsonb_build_object('phase',p_phase));
  return v_run_id;
end $$;

create or replace function public.set_operational_checklist_item(
  p_item_id uuid,
  p_status text,
  p_note text default null,
  p_actor_id uuid default auth.uid()
) returns void
language plpgsql security definer set search_path=public as $$
declare v_before public.operational_checklist_run_items%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' and public.current_role() not in ('manager','counter','finance') then raise exception 'Sem permissão para atualizar rotina'; end if;
  if p_status not in ('pending','done','skipped','blocked') then raise exception 'Status inválido'; end if;
  if p_status in ('skipped','blocked') and coalesce(trim(p_note),'')='' then raise exception 'Informe o motivo'; end if;
  select * into v_before from public.operational_checklist_run_items where id=p_item_id for update;
  if not found then raise exception 'Item não encontrado'; end if;
  update public.operational_checklist_run_items
     set status=p_status,note=p_note,
         completed_by=case when p_status in ('done','skipped') then p_actor_id else null end,
         completed_by_label=case when p_status in ('done','skipped') then coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema') else null end,
         completed_at=case when p_status in ('done','skipped') then now() else null end
   where id=p_item_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
    'OPERATIONAL_CHECKLIST_ITEM_CHANGED','checklist_item',p_item_id::text,p_note,to_jsonb(v_before),jsonb_build_object('status',p_status,'note',p_note));
end $$;

create or replace function public.complete_operational_checklist(
  p_run_id uuid,
  p_notes text default null,
  p_actor_id uuid default auth.uid()
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_run public.operational_checklist_runs%rowtype; v_pending integer; v_summary jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' and public.current_role() not in ('manager','counter','finance') then raise exception 'Sem permissão para concluir rotina'; end if;
  select * into v_run from public.operational_checklist_runs where id=p_run_id for update;
  if not found then raise exception 'Rotina não encontrada'; end if;
  if v_run.status<>'in_progress' then raise exception 'Rotina já finalizada'; end if;
  select count(*) into v_pending from public.operational_checklist_run_items
   where run_id=p_run_id and required and status in ('pending','blocked');
  if v_pending>0 then raise exception 'Existem itens obrigatórios pendentes ou bloqueados'; end if;
  select jsonb_build_object(
    'total',count(*),
    'done',count(*) filter(where status='done'),
    'skipped',count(*) filter(where status='skipped'),
    'blocked',count(*) filter(where status='blocked')
  ) into v_summary from public.operational_checklist_run_items where run_id=p_run_id;
  update public.operational_checklist_runs set status='completed',completed_by=p_actor_id,
    completed_at=now(),summary=v_summary,notes=p_notes where id=p_run_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
    'OPERATIONAL_CHECKLIST_COMPLETED','checklist_run',p_run_id::text,p_notes,v_summary);
  return v_summary;
end $$;

create or replace function public.resolve_approval_request(
  p_id uuid,
  p_decision text,
  p_review_note text default null,
  p_actor_id uuid default auth.uid()
) returns void
language plpgsql security definer set search_path=public as $$
declare v_before public.approval_requests%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' and public.current_role()<>'manager' then raise exception 'Somente o gestor pode decidir aprovações'; end if;
  if p_decision not in ('approved','rejected','cancelled') then raise exception 'Decisão inválida'; end if;
  select * into v_before from public.approval_requests where id=p_id for update;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  if v_before.status<>'pending' then raise exception 'Solicitação já processada'; end if;
  update public.approval_requests set status=p_decision,reviewed_by=p_actor_id,reviewed_at=now(),review_note=p_review_note where id=p_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
    'APPROVAL_'||upper(p_decision),'approval_request',p_id::text,p_review_note,to_jsonb(v_before),jsonb_build_object('status',p_decision));
end $$;

create or replace function public.set_order_expedition_status(
  p_order_id text,
  p_status text,
  p_notes text default null,
  p_actor_id uuid default auth.uid()
) returns void
language plpgsql security definer set search_path=public as $$
declare v_before text;
begin
  if coalesce(auth.role(),'') <> 'service_role' and public.current_role() not in ('manager','counter','kitchen','bar') then raise exception 'Sem permissão para operar expedição'; end if;
  if p_status not in ('pending','checking','approved','returned') then raise exception 'Status inválido'; end if;
  select expedition_status into v_before from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  update public.orders set expedition_status=p_status,expedition_notes=p_notes,
    expedition_checked_by=case when p_status='approved' then p_actor_id else null end,
    expedition_checked_at=case when p_status='approved' then now() else null end,
    updated_at=now(),updated_by=p_actor_id,version=version+1 where id=p_order_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
    'ORDER_EXPEDITION_CHANGED','order',p_order_id,p_notes,jsonb_build_object('status',v_before),jsonb_build_object('status',p_status));
end $$;


create or replace function public.receive_purchase_order(
  p_order_id uuid,
  p_items jsonb,
  p_actor_id uuid default auth.uid()
) returns text
language plpgsql security definer set search_path=public as $$
declare
  v_order public.purchase_orders%rowtype;
  v_entry jsonb;
  v_item public.purchase_order_items%rowtype;
  v_inventory_id uuid;
  v_quantity numeric(12,3);
  v_previous numeric(12,3);
  v_all_received boolean;
  v_any_received boolean;
begin
  if coalesce(auth.role(),'') <> 'service_role' and public.current_role() not in ('manager','counter','finance') then raise exception 'Sem permissão para receber compras'; end if;
  select * into v_order from public.purchase_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido de compra não encontrado'; end if;
  if v_order.status in ('received','cancelled') then raise exception 'Pedido de compra não pode mais ser recebido'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Informe os itens recebidos'; end if;

  for v_entry in select * from jsonb_array_elements(p_items)
  loop
    select * into v_item from public.purchase_order_items
      where id=(v_entry->>'itemId')::uuid and purchase_order_id=p_order_id for update;
    if not found then raise exception 'Item de compra inválido'; end if;
    v_quantity:=coalesce((v_entry->>'receivedQuantity')::numeric,0);
    if v_quantity<=0 then raise exception 'Quantidade recebida deve ser maior que zero'; end if;
    v_previous:=v_item.received_quantity;
    if v_previous+v_quantity>v_item.ordered_quantity then
      raise exception 'Recebimento ultrapassa a quantidade pedida para %',v_item.product_id;
    end if;

    update public.purchase_order_items
      set received_quantity=received_quantity+v_quantity,
          expires_at=coalesce(nullif(v_entry->>'expiresAt','')::date,expires_at)
      where id=v_item.id;

    select id into v_inventory_id from public.inventory_items where product_id=v_item.product_id for update;
    if v_inventory_id is null then raise exception 'Produto sem controle de estoque: %',v_item.product_id; end if;
    update public.inventory_items set quantity=quantity+v_quantity,version=version+1,updated_at=now() where id=v_inventory_id;
    insert into public.inventory_movements(inventory_item_id,kind,delta,reason,created_by,idempotency_key)
      values(v_inventory_id,'entry',v_quantity,'Entrada pelo pedido de compra #'||v_order.number,p_actor_id,
        'purchase:'||p_order_id::text||':'||v_item.id::text||':'||(v_previous+v_quantity)::text);
  end loop;

  select bool_and(received_quantity>=ordered_quantity),bool_or(received_quantity>0)
    into v_all_received,v_any_received from public.purchase_order_items where purchase_order_id=p_order_id;
  update public.purchase_orders
    set status=case when v_all_received then 'received' when v_any_received then 'partially_received' else status end,
        received_by=case when v_all_received then p_actor_id else received_by end,
        received_at=case when v_all_received then now() else received_at end,
        updated_at=now()
    where id=p_order_id;

  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),
    'PURCHASE_ORDER_RECEIVED','purchase_order',p_order_id::text,jsonb_build_object('items',p_items,'complete',v_all_received));
  return case when v_all_received then 'received' else 'partially_received' end;
end $$;

alter table public.operational_checklist_templates enable row level security;
alter table public.operational_checklist_runs enable row level security;
alter table public.operational_checklist_run_items enable row level security;
alter table public.operation_tasks enable row level security;
alter table public.approval_requests enable row level security;
alter table public.internal_notifications enable row level security;
alter table public.system_health_checks enable row level security;
alter table public.print_profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.system_migrations enable row level security;

drop policy if exists checklist_templates_read on public.operational_checklist_templates;
create policy checklist_templates_read on public.operational_checklist_templates for select to authenticated using (true);
drop policy if exists checklist_runs_operation on public.operational_checklist_runs;
create policy checklist_runs_operation on public.operational_checklist_runs for select to authenticated using (public.current_role() in ('manager','counter','finance','viewer'));
drop policy if exists checklist_items_operation on public.operational_checklist_run_items;
create policy checklist_items_operation on public.operational_checklist_run_items for select to authenticated using (public.current_role() in ('manager','counter','finance','viewer'));
drop policy if exists operation_tasks_read on public.operation_tasks;
create policy operation_tasks_read on public.operation_tasks for select to authenticated using (public.current_role() in ('manager','counter','waiter','kitchen','bar','driver','finance','viewer'));
drop policy if exists approval_requests_read on public.approval_requests;
create policy approval_requests_read on public.approval_requests for select to authenticated using (public.current_role() in ('manager','counter','waiter','finance','viewer'));
drop policy if exists internal_notifications_read on public.internal_notifications;
create policy internal_notifications_read on public.internal_notifications for select to authenticated using (recipient_id=auth.uid() or recipient_id is null or audience_role=public.current_role());
drop policy if exists system_health_read on public.system_health_checks;
create policy system_health_read on public.system_health_checks for select to authenticated using (public.current_role() in ('manager','viewer'));
drop policy if exists print_profiles_read on public.print_profiles;
create policy print_profiles_read on public.print_profiles for select to authenticated using (public.current_role() in ('manager','counter','kitchen','bar','viewer'));
drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated using (public.current_role() in ('manager','counter','finance','viewer'));
drop policy if exists purchase_orders_read on public.purchase_orders;
create policy purchase_orders_read on public.purchase_orders for select to authenticated using (public.current_role() in ('manager','counter','finance','viewer'));
drop policy if exists purchase_order_items_read on public.purchase_order_items;
create policy purchase_order_items_read on public.purchase_order_items for select to authenticated using (public.current_role() in ('manager','counter','finance','viewer'));
drop policy if exists system_migrations_read on public.system_migrations;
create policy system_migrations_read on public.system_migrations for select to authenticated using (public.current_role() in ('manager','viewer'));

grant select on public.operational_checklist_templates,public.operational_checklist_runs,public.operational_checklist_run_items,
  public.operation_tasks,public.approval_requests,public.internal_notifications,public.system_health_checks,
  public.print_profiles,public.suppliers,public.purchase_orders,public.purchase_order_items,public.system_migrations
  to authenticated,service_role;
grant execute on function public.start_operational_checklist(text,uuid) to authenticated,service_role;
grant execute on function public.set_operational_checklist_item(uuid,text,text,uuid) to authenticated,service_role;
grant execute on function public.complete_operational_checklist(uuid,text,uuid) to authenticated,service_role;
grant execute on function public.resolve_approval_request(uuid,text,text,uuid) to authenticated,service_role;
grant execute on function public.set_order_expedition_status(text,text,text,uuid) to authenticated,service_role;
grant execute on function public.receive_purchase_order(uuid,jsonb,uuid) to authenticated,service_role;


insert into public.system_migrations(version,name) values
  (1,'Estrutura principal'),
  (2,'Cardápio oficial'),
  (3,'Funções operacionais'),
  (4,'Integrações e acesso público'),
  (5,'Filas e workers'),
  (6,'Avaliações e experiência'),
  (7,'Gestão, financeiro, CRM e configurações'),
  (8,'Autorizações de fidelidade'),
  (9,'Pedidos internos e comandas'),
  (10,'Grupos de salão e pagamentos'),
  (11,'QR de mesas e endurecimento de pedidos'),
  (12,'Gestão dinâmica do cardápio'),
  (13,'Central administrativa de pedidos')
on conflict(version) do nothing;

insert into public.system_migrations(version,name) values(14,'Autonomia operacional e controle total')
on conflict(version) do update set name=excluded.name,applied_at=now();

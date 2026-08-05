-- Management modules: cash movements, finance, CRM/report views, settings and operational hardening.

create table if not exists public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income','expense')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(name,kind)
);

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income','expense')),
  status text not null default 'pending' check (status in ('pending','settled','cancelled')),
  description text not null,
  category_id uuid references public.financial_categories(id),
  amount_cents integer not null check (amount_cents > 0),
  due_date date not null,
  settled_at timestamptz,
  payment_method public.payment_method,
  recurring boolean not null default false,
  source_type text,
  source_id text,
  notes text check (char_length(notes) <= 1000),
  created_by uuid references public.profiles(id),
  settled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint financial_settlement_consistency check (
    (status='settled' and settled_at is not null) or (status<>'settled')
  )
);
create index if not exists financial_entries_due_idx on public.financial_entries(status,due_date);
create index if not exists financial_entries_source_idx on public.financial_entries(source_type,source_id);

create table if not exists public.payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  reference_date date not null,
  gross_cents integer not null default 0,
  fee_cents integer not null default 0,
  net_cents integer not null default 0,
  expected_cents integer not null default 0,
  difference_cents integer not null default 0,
  status text not null default 'pending' check (status in ('pending','matched','divergent','resolved')),
  details jsonb not null default '{}'::jsonb,
  reconciled_by uuid references public.profiles(id),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,reference_date)
);

insert into public.financial_categories(name,kind) values
  ('Vendas','income'),('Receitas diversas','income'),('Marketplaces','income'),
  ('Insumos','expense'),('Equipe','expense'),('Taxas','expense'),('Operação','expense'),('Impostos','expense')
on conflict(name,kind) do nothing;

create or replace view public.crm_customer_metrics with (security_invoker=true) as
select
  c.id,
  c.name,
  c.phone,
  c.email,
  c.birth_date,
  c.notes,
  c.marketing_email,
  c.marketing_push,
  c.marketing_whatsapp,
  c.active,
  c.created_at,
  count(o.id) filter (where o.status='completed' and o.payment_status='paid')::integer as valid_orders,
  coalesce(sum(o.total_cents) filter (where o.status='completed' and o.payment_status='paid'),0)::bigint as total_spent_cents,
  max(o.created_at) filter (where o.status='completed') as last_order_at,
  coalesce(round(avg(o.total_cents) filter (where o.status='completed' and o.payment_status='paid')),0)::bigint as average_ticket_cents,
  case
    when count(o.id) filter (where o.status='completed' and o.payment_status='paid') <= 1 then 'new'
    when max(o.created_at) filter (where o.status='completed') < now()-interval '60 days' then 'inactive'
    when count(o.id) filter (where o.status='completed' and o.payment_status='paid') >= 5 then 'frequent'
    else 'active'
  end as segment
from public.customers c
left join public.orders o on o.customer_id=c.id and o.channel not in ('ifood','99food') and o.deleted_at is null
group by c.id;

create or replace view public.daily_sales_summary with (security_invoker=true) as
select
  created_at::date as sale_date,
  channel,
  payment_method,
  count(*) filter (where status<>'cancelled')::integer as order_count,
  count(*) filter (where status='cancelled')::integer as cancelled_count,
  coalesce(sum(total_cents) filter (where payment_status='paid' and status<>'cancelled'),0)::bigint as paid_total_cents,
  coalesce(sum(discount_cents) filter (where status<>'cancelled'),0)::bigint as discount_total_cents,
  coalesce(avg(total_cents) filter (where payment_status='paid' and status<>'cancelled'),0)::numeric as average_ticket_cents
from public.orders
where deleted_at is null
group by created_at::date,channel,payment_method;

create or replace function public.record_cash_movement(
  p_kind text,
  p_amount_cents integer,
  p_reason text,
  p_actor_id uuid default auth.uid()
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_session public.cash_sessions%rowtype; v_signed integer; v_id uuid;
begin
  if p_kind not in ('supply','withdrawal','adjustment') then raise exception 'Tipo de movimentação inválido'; end if;
  if p_amount_cents <= 0 then raise exception 'Valor deve ser positivo'; end if;
  if length(trim(p_reason)) < 2 then raise exception 'Motivo obrigatório'; end if;
  select * into v_session from public.cash_sessions where status='open' order by opened_at desc limit 1 for update;
  if not found then raise exception 'Não existe caixa aberto'; end if;
  v_signed := case when p_kind='withdrawal' then -p_amount_cents else p_amount_cents end;
  insert into public.cash_movements(session_id,kind,amount_cents,reason,created_by)
  values(v_session.id,p_kind,v_signed,p_reason,p_actor_id) returning id into v_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'CASH_MOVEMENT_CREATED','cash_movement',v_id::text,p_reason,jsonb_build_object('kind',p_kind,'amountCents',v_signed,'sessionId',v_session.id));
  return v_id;
end $$;

grant execute on function public.record_cash_movement(text,integer,text,uuid) to authenticated,service_role;

create or replace function public.settle_financial_entry(
  p_entry_id uuid,
  p_payment_method public.payment_method,
  p_actor_id uuid default auth.uid()
) returns void
language plpgsql security definer set search_path=public as $$
declare v_before public.financial_entries%rowtype;
begin
  select * into v_before from public.financial_entries where id=p_entry_id and deleted_at is null for update;
  if not found then raise exception 'Lançamento não encontrado'; end if;
  if v_before.status<>'pending' then raise exception 'Somente lançamento pendente pode ser liquidado'; end if;
  update public.financial_entries set status='settled',settled_at=now(),payment_method=p_payment_method,settled_by=p_actor_id,updated_at=now() where id=p_entry_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'FINANCIAL_ENTRY_SETTLED','financial_entry',p_entry_id::text,to_jsonb(v_before),jsonb_build_object('status','settled','paymentMethod',p_payment_method));
end $$;

grant execute on function public.settle_financial_entry(uuid,public.payment_method,uuid) to authenticated,service_role;

create or replace function public.set_menu_item_availability(
  p_entity text,
  p_id text,
  p_active boolean,
  p_actor_id uuid default auth.uid()
) returns void
language plpgsql security definer set search_path=public as $$
declare v_before jsonb;
begin
  if p_entity='flavor' then
    select to_jsonb(f) into v_before from public.pizza_flavors f where id=p_id for update;
    if v_before is null then raise exception 'Sabor não encontrado'; end if;
    update public.pizza_flavors set active=p_active,updated_at=now() where id=p_id;
  elsif p_entity='product' then
    select to_jsonb(p) into v_before from public.products p where id=p_id for update;
    if v_before is null then raise exception 'Produto não encontrado'; end if;
    update public.products set active=p_active,updated_at=now() where id=p_id;
  elsif p_entity='addon' then
    select to_jsonb(a) into v_before from public.addons a where id=p_id for update;
    if v_before is null then raise exception 'Adicional não encontrado'; end if;
    update public.addons set active=p_active,updated_at=now() where id=p_id;
  else
    raise exception 'Tipo de item inválido';
  end if;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'MENU_AVAILABILITY_CHANGED',p_entity,p_id,v_before,jsonb_build_object('active',p_active));
end $$;

grant execute on function public.set_menu_item_availability(text,text,boolean,uuid) to authenticated,service_role;

-- Harden all operational tables. Server APIs use service-role; direct access is intentionally restricted by role.
alter table public.business_settings enable row level security;
alter table public.price_history enable row level security;
alter table public.order_status_history enable row level security;
alter table public.tab_item_allocations enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.tracking_tokens enable row level security;
alter table public.integration_connections enable row level security;
alter table public.integration_events enable row level security;
alter table public.print_jobs enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.sync_queue enable row level security;
alter table public.financial_categories enable row level security;
alter table public.financial_entries enable row level security;
alter table public.payment_reconciliations enable row level security;

create policy business_settings_manager on public.business_settings for all to authenticated using (public.current_role()='manager') with check (public.current_role()='manager');
create policy order_history_operation on public.order_status_history for select to authenticated using (public.current_role() in ('manager','counter','waiter','kitchen','bar','driver','finance','viewer'));
create policy tab_allocations_operation on public.tab_item_allocations for all to authenticated using (public.current_role() in ('manager','counter','waiter')) with check (public.current_role() in ('manager','counter','waiter'));
create policy cash_sessions_finance on public.cash_sessions for select to authenticated using (public.current_role() in ('manager','counter','finance'));
create policy cash_movements_finance on public.cash_movements for select to authenticated using (public.current_role() in ('manager','counter','finance'));
create policy inventory_movements_operation on public.inventory_movements for select to authenticated using (public.current_role() in ('manager','counter'));
create policy delivery_zones_manager on public.delivery_zones for all to authenticated using (public.current_role()='manager') with check (public.current_role()='manager');
create policy coupon_redemptions_operation on public.coupon_redemptions for select to authenticated using (public.current_role() in ('manager','counter','finance'));
create policy integration_connections_manager on public.integration_connections for all to authenticated using (public.current_role()='manager') with check (public.current_role()='manager');
create policy integration_events_manager on public.integration_events for select to authenticated using (public.current_role()='manager');
create policy print_jobs_operation on public.print_jobs for select to authenticated using (public.current_role() in ('manager','counter','kitchen','bar'));
create policy notification_jobs_manager on public.notification_jobs for select to authenticated using (public.current_role()='manager');
create policy campaigns_manager on public.campaigns for all to authenticated using (public.current_role()='manager') with check (public.current_role()='manager');
create policy campaign_recipients_manager on public.campaign_recipients for select to authenticated using (public.current_role()='manager');
create policy financial_categories_finance on public.financial_categories for all to authenticated using (public.current_role() in ('manager','finance')) with check (public.current_role() in ('manager','finance'));
create policy financial_entries_finance on public.financial_entries for all to authenticated using (public.current_role() in ('manager','finance')) with check (public.current_role() in ('manager','finance'));
create policy payment_reconciliations_finance on public.payment_reconciliations for all to authenticated using (public.current_role() in ('manager','finance')) with check (public.current_role() in ('manager','finance'));

revoke all on public.tracking_tokens,public.idempotency_keys,public.sync_queue from anon,authenticated;

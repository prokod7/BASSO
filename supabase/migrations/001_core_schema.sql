-- La Forneria Basso / PedidoPro 3.1
-- Core schema, integrity rules, RLS, audit, idempotency and operational RPCs.
create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.app_role as enum ('manager','counter','waiter','kitchen','bar','driver','finance','viewer');
create type public.order_channel as enum ('own_delivery','pickup','counter','dine_in','ifood','99food','table_qr');
create type public.order_status as enum ('received','confirmed','preparing','ready','out_for_delivery','completed','cancelled');
create type public.payment_status as enum ('pending','partial','paid','refunded','cancelled');
create type public.payment_method as enum ('pix','cash','debit','credit','meal_voucher','food_voucher');
create type public.job_status as enum ('queued','processing','done','failed','cancelled');

create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'La Forneria Basso',
  cnpj text not null default '62.332.415/0001-10',
  phone text not null default '(11) 97235-6751',
  instagram text not null default '@laforneriabasso',
  address jsonb not null default '{"street":"Rua do Progresso","number":"407","district":"Centro","city":"Rio Grande da Serra","state":"SP"}'::jsonb,
  opening_hours jsonb not null default '{"monday":null,"tuesday":["18:00","23:00"],"wednesday":["18:00","23:00"],"thursday":["18:00","23:00"],"friday":["18:00","23:00"],"saturday":["18:00","23:00"],"sunday":["18:00","23:00"]}'::jsonb,
  minimum_order_cents integer not null default 0 check (minimum_order_cents >= 0),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.app_role not null,
  active boolean not null default true,
  device_limit integer not null default 3 check (device_limit > 0),
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('pizza','beverage','dessert','combo','addon')),
  sort_order integer not null default 0,
  active boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pizza_flavors (
  id text primary key,
  name text not null,
  category text not null check (category in ('traditional','premium','sweet')),
  price_grande_cents integer not null check (price_grande_cents >= 0),
  price_broto_cents integer not null check (price_broto_cents >= 0),
  ingredients text[] not null default '{}',
  description text not null,
  featured boolean not null default false,
  active boolean not null default true,
  available_channels public.order_channel[] not null default array['own_delivery','pickup','counter','dine_in','table_qr']::public.order_channel[],
  available_schedule jsonb not null default '{}'::jsonb,
  allergens text[] not null default '{}',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addons (
  id text primary key,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  max_quantity integer not null default 2 check (max_quantity between 1 and 2),
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id text primary key,
  name text not null,
  category text not null check (category in ('beverages','desserts','combo')),
  description text not null default '',
  variant text,
  price_cents integer not null check (price_cents >= 0),
  image_url text,
  stock_tracked boolean not null default false,
  active boolean not null default true,
  available_channels public.order_channel[] not null default array['own_delivery','pickup','counter','dine_in','table_qr']::public.order_channel[],
  available_schedule jsonb not null default '{}'::jsonb,
  allergens text[] not null default '{}',
  config jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('pizza_flavor','addon','product')),
  entity_id text not null,
  price_kind text not null,
  price_cents integer not null check (price_cents >= 0),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  changed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.restaurant_tables (
  number integer primary key check (number between 1 and 15),
  capacity integer not null check (capacity in (2,5)),
  status text not null default 'free' check (status in ('free','occupied','cleaning','partial')),
  people_count integer check (people_count is null or people_count >= 0),
  opened_at timestamptz,
  opened_by uuid references public.profiles(id),
  group_id uuid,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone citext not null unique,
  email citext,
  birth_date date,
  source text not null default 'own' check (source = 'own'),
  notes text,
  marketing_email boolean not null default false,
  marketing_push boolean not null default false,
  marketing_whatsapp boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text,
  cep text not null,
  street text not null,
  number text not null,
  district text not null,
  complement text,
  reference text,
  city text not null,
  state char(2) not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id text primary key,
  number bigint not null unique,
  channel public.order_channel not null,
  status public.order_status not null default 'received',
  payment_status public.payment_status not null default 'pending',
  customer_id uuid references public.customers(id),
  customer_name text not null,
  customer_phone text not null default '',
  address jsonb,
  table_number integer references public.restaurant_tables(number),
  tab_id uuid,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  payment_method public.payment_method not null,
  change_for_cents integer,
  notes text check (char_length(notes) <= 500),
  coupon_code text,
  source_idempotency_key text not null unique,
  external_id text,
  external_payload jsonb,
  driver_id uuid,
  tracking_token_hash text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz,
  constraint order_total_math check (total_cents = greatest(0, subtotal_cents - discount_cents + delivery_fee_cents)),
  constraint delivery_requires_address check (channel <> 'own_delivery' or address is not null),
  constraint delivery_status_by_channel check (status <> 'out_for_delivery' or channel in ('own_delivery','ifood','99food'))
);

create table public.order_items (
  id text primary key,
  order_id text not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('pizza','product','combo','reward')),
  name_snapshot text not null,
  quantity integer not null check (quantity between 1 and 99),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  product_id text,
  selection jsonb,
  sector text not null default 'kitchen' check (sector in ('kitchen','bar','counter')),
  production_status text not null default 'queued' check (production_status in ('queued','preparing','ready','cancelled')),
  created_at timestamptz not null default now(),
  constraint no_border_payload check (
    selection is null or (
      not (selection ? 'border') and not (selection ? 'borda') and not (selection ? 'borderId') and not (selection ? 'bordaId')
    )
  ),
  constraint broto_single_flavor check (
    selection is null or selection->>'size' <> 'broto' or coalesce(selection->>'flavorB','') = ''
  ),
  constraint item_notes_limit check (selection is null or char_length(coalesce(selection->>'notes','')) <= 500)
);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  reason text,
  actor_id uuid references public.profiles(id),
  source text not null default 'system',
  device_id text,
  created_at timestamptz not null default now()
);

create table public.tabs (
  id uuid primary key default gen_random_uuid(),
  table_number integer not null references public.restaurant_tables(number),
  name text not null,
  waiter_id uuid references public.profiles(id),
  status text not null default 'open' check (status in ('open','partial','closed','cancelled')),
  paid_cents integer not null default 0 check (paid_cents >= 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add constraint orders_tab_fk foreign key (tab_id) references public.tabs(id);

create table public.tab_item_allocations (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs(id) on delete cascade,
  order_item_id text not null references public.order_items(id) on delete cascade,
  quantity numeric(10,3) not null check (quantity > 0),
  paid_cents integer not null default 0 check (paid_cents >= 0),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id text references public.orders(id),
  tab_id uuid references public.tabs(id),
  method public.payment_method not null,
  status public.payment_status not null,
  amount_cents integer not null check (amount_cents > 0),
  provider text,
  external_id text,
  terminal_id text,
  authorization_code text,
  installments integer not null default 1 check (installments > 0),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_has_target check ((order_id is not null)::int + (tab_id is not null)::int = 1)
);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references public.profiles(id),
  opened_at timestamptz not null default now(),
  initial_cents integer not null check (initial_cents >= 0),
  status text not null default 'open' check (status in ('open','closed')),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  declared_cents integer,
  expected_cents integer,
  difference_cents integer,
  notes text
);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions(id),
  kind text not null check (kind in ('sale','supply','withdrawal','refund','adjustment')),
  amount_cents integer not null,
  reason text not null,
  payment_id uuid references public.payments(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  product_id text not null unique references public.products(id),
  unit text not null default 'unidade',
  quantity numeric(12,3) not null default 0,
  minimum_quantity numeric(12,3) not null default 0,
  allow_negative boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint stock_only_restricted_products check (product_id is not null)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id),
  kind text not null check (kind in ('sale','entry','adjustment','loss','refund')),
  delta numeric(12,3) not null check (delta <> 0),
  order_id text references public.orders(id),
  reason text,
  created_by uuid references public.profiles(id),
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  districts text[] not null default '{}',
  fee_cents integer not null check (fee_cents >= 0),
  minimum_order_cents integer not null default 0,
  max_distance_km numeric(8,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  value integer not null check (value > 0),
  total_limit integer check (total_limit is null or total_limit > 0),
  uses integer not null default 0 check (uses >= 0),
  minimum_cents integer,
  channels public.order_channel[] not null,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupon_not_overused check (total_limit is null or uses <= total_limit)
);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id),
  order_id text not null unique references public.orders(id),
  discount_cents integer not null check (discount_cents >= 0),
  created_at timestamptz not null default now()
);

create table public.loyalty_accounts (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  balance integer not null default 0 check (balance between 0 and 15),
  lifetime_points integer not null default 0 check (lifetime_points >= 0),
  rewards_redeemed integer not null default 0 check (rewards_redeemed >= 0),
  updated_at timestamptz not null default now()
);

create table public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  order_id text references public.orders(id),
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('eligible_order','reward_redemption','manual_correction')),
  balance_after integer not null check (balance_after between 0 and 15),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (order_id, reason)
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id),
  name text not null,
  phone text not null,
  vehicle text,
  active boolean not null default true,
  available boolean not null default true,
  active_order_id text references public.orders(id),
  last_latitude numeric(10,7),
  last_longitude numeric(10,7),
  last_accuracy numeric(10,2),
  last_location_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add constraint orders_driver_fk foreign key (driver_id) references public.drivers(id);

create table public.driver_locations (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  order_id text not null references public.orders(id) on delete cascade,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  accuracy numeric(10,2),
  captured_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index driver_locations_active_idx on public.driver_locations(order_id, captured_at desc);

create table public.tracking_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique references public.orders(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.integration_connections (
  provider text primary key check (provider in ('ifood','99food','rede','onesignal','printer','fiscal')),
  active boolean not null default false,
  environment text not null default 'sandbox',
  encrypted_config jsonb not null default '{}'::jsonb,
  last_health_at timestamptz,
  last_health_status text,
  updated_at timestamptz not null default now()
);

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  direction text not null default 'incoming' check (direction in ('incoming','outgoing')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','done','failed','dead_letter')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider,event_id)
);

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id text references public.orders(id),
  tab_id uuid references public.tabs(id),
  sector text not null,
  printer_key text not null,
  payload jsonb not null,
  status public.job_status not null default 'queued',
  attempts integer not null default 0,
  is_reprint boolean not null default false,
  last_error text,
  next_attempt_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('push','email','manual_whatsapp')),
  recipient_ref text,
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null check (channel in ('push','email')),
  segment jsonb not null,
  template jsonb not null,
  status text not null default 'draft' check (status in ('draft','scheduled','running','completed','cancelled')),
  scheduled_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  status text not null default 'pending',
  sent_at timestamptz,
  opened_at timestamptz,
  converted_order_id text references public.orders(id),
  unique(campaign_id,customer_id)
);

create table public.idempotency_keys (
  key text primary key,
  scope text not null,
  response_body jsonb not null,
  status_code integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create table public.sync_queue (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  operation_id text not null,
  entity_type text not null,
  payload jsonb not null,
  status public.job_status not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(client_id,operation_id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  actor_label text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  origin text not null default 'app',
  device_id text,
  ip_hash text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity_type,entity_id,created_at desc);

-- Public menu views expose only active commercial data and never internal loyalty.
create or replace view public.public_menu_flavors with (security_invoker=true) as
select id,name,category,price_grande_cents,price_broto_cents,ingredients,description,featured,allergens
from public.pizza_flavors where active;
create or replace view public.public_menu_products with (security_invoker=true) as
select id,name,category,description,variant,price_cents,image_url,allergens,config
from public.products where active;
create or replace view public.public_menu_addons with (security_invoker=true) as
select id,name,price_cents,max_quantity from public.addons where active;

create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path=public as $$
  select role from public.profiles where id=auth.uid() and active limit 1
$$;

create or replace function public.can_manage_operation() returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.current_role() in ('manager','counter','kitchen','bar','waiter'),false)
$$;

create or replace function public.create_order_transaction(p_order jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_order_id text := p_order->>'id'; v_item jsonb; v_customer_id uuid; v_phone text := coalesce(p_order->>'customerPhone','');
begin
  if exists(select 1 from public.orders where source_idempotency_key=p_order->>'sourceIdempotencyKey') then
    return jsonb_build_object('id',v_order_id,'duplicate',true);
  end if;
  if p_order->>'channel' not in ('ifood','99food') and length(v_phone)>=10 then
    insert into public.customers(name,phone) values(p_order->>'customerName',v_phone)
    on conflict(phone) do update set name=excluded.name,updated_at=now()
    returning id into v_customer_id;
  end if;
  insert into public.orders(id,number,channel,status,payment_status,customer_id,customer_name,customer_phone,address,table_number,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,payment_method,change_for_cents,notes,coupon_code,source_idempotency_key,driver_id,created_at,updated_at)
  values(v_order_id,(p_order->>'number')::bigint,(p_order->>'channel')::public.order_channel,(p_order->>'status')::public.order_status,(p_order->>'paymentStatus')::public.payment_status,v_customer_id,p_order->>'customerName',v_phone,p_order->'address',nullif(p_order->>'tableNumber','')::integer,(p_order->>'subtotal')::integer,(p_order->>'discount')::integer,(p_order->>'deliveryFee')::integer,(p_order->>'total')::integer,(p_order->>'paymentMethod')::public.payment_method,nullif(p_order->>'changeFor','')::integer,p_order->>'notes',p_order->>'couponCode',p_order->>'sourceIdempotencyKey',nullif(p_order->>'driverId','')::uuid,coalesce((p_order->>'createdAt')::timestamptz,now()),coalesce((p_order->>'updatedAt')::timestamptz,now()));
  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    if coalesce(v_item->'selection','{}'::jsonb) ?| array['border','borda','borderId','bordaId'] then raise exception 'Bordas não existem neste sistema'; end if;
    if v_item->'selection'->>'size'='broto' and coalesce(v_item->'selection'->>'flavorB','')<>'' then raise exception 'Pizza Broto aceita somente um sabor'; end if;
    insert into public.order_items(id,order_id,kind,name_snapshot,quantity,unit_price_cents,product_id,selection,sector)
    values(v_item->>'id',v_order_id,v_item->>'kind',v_item->>'name',(v_item->>'quantity')::integer,(v_item->>'unitPrice')::integer,v_item->>'productId',v_item->'selection',case when v_item->>'kind'='product' then 'bar' else 'kitchen' end);
  end loop;
  insert into public.order_status_history(order_id,to_status,source) values(v_order_id,(p_order->>'status')::public.order_status,'create_order');
  insert into public.audit_logs(actor_label,action,entity_type,entity_id,after_data) values(coalesce((select display_name from public.profiles where id=auth.uid()),'Sistema'),'ORDER_CREATED','order',v_order_id,p_order);
  return jsonb_build_object('id',v_order_id,'duplicate',false);
end $$;

create or replace function public.change_order_status(p_order_id text,p_status public.order_status,p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare v_old public.order_status; v_channel public.order_channel; v_customer uuid; v_payment public.payment_status; v_balance integer;
begin
  select status,channel,customer_id,payment_status into v_old,v_channel,v_customer,v_payment from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if p_status='out_for_delivery' and v_channel not in ('own_delivery','ifood','99food') then raise exception 'Status não permitido para o canal'; end if;
  update public.orders set status=p_status,updated_at=now(),completed_at=case when p_status='completed' then now() else completed_at end where id=p_order_id;
  insert into public.order_status_history(order_id,from_status,to_status,reason,actor_id,source) values(p_order_id,v_old,p_status,p_reason,auth.uid(),'operation');
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data) values(auth.uid(),coalesce((select display_name from public.profiles where id=auth.uid()),'Sistema'),'ORDER_STATUS_CHANGED','order',p_order_id,p_reason,jsonb_build_object('status',v_old),jsonb_build_object('status',p_status));
  if p_status='completed' and v_old<>'completed' and v_channel='own_delivery' and v_payment='paid' and v_customer is not null then
    insert into public.loyalty_accounts(customer_id) values(v_customer) on conflict do nothing;
    select balance into v_balance from public.loyalty_accounts where customer_id=v_customer for update;
    if not exists(select 1 from public.loyalty_ledger where order_id=p_order_id and reason='eligible_order') then
      v_balance:=least(15,v_balance+1);
      update public.loyalty_accounts set balance=v_balance,lifetime_points=lifetime_points+1,updated_at=now() where customer_id=v_customer;
      insert into public.loyalty_ledger(customer_id,order_id,delta,reason,balance_after) values(v_customer,p_order_id,1,'eligible_order',v_balance);
    end if;
  end if;
end $$;

create or replace function public.redeem_loyalty_reward(p_customer_id uuid,p_flavor_id text,p_actor_id uuid default auth.uid()) returns integer
language plpgsql security definer set search_path=public as $$
declare v_balance integer;
begin
  if p_flavor_id not in ('mozzarella','calabresa-tradicional') then raise exception 'Sabor não elegível'; end if;
  select balance into v_balance from public.loyalty_accounts where customer_id=p_customer_id for update;
  if coalesce(v_balance,0)<10 then raise exception 'Saldo insuficiente'; end if;
  v_balance:=v_balance-10;
  update public.loyalty_accounts set balance=v_balance,rewards_redeemed=rewards_redeemed+1,updated_at=now() where customer_id=p_customer_id;
  insert into public.loyalty_ledger(customer_id,delta,reason,balance_after,created_by) values(p_customer_id,-10,'reward_redemption',v_balance,p_actor_id);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(p_actor_id,'LOYALTY_REDEEMED','customer',p_customer_id::text,jsonb_build_object('flavor',p_flavor_id,'balance',v_balance));
  return v_balance;
end $$;

create or replace function public.record_driver_location(p_driver_id uuid,p_order_id text,p_latitude numeric,p_longitude numeric,p_accuracy numeric,p_captured_at timestamptz) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.drivers where id=p_driver_id and active_order_id=p_order_id and active) then raise exception 'Entrega não atribuída ao motoboy'; end if;
  if not exists(select 1 from public.orders where id=p_order_id and status='out_for_delivery') then raise exception 'Rastreamento permitido somente em entrega ativa'; end if;
  insert into public.driver_locations(driver_id,order_id,latitude,longitude,accuracy,captured_at) values(p_driver_id,p_order_id,p_latitude,p_longitude,p_accuracy,p_captured_at);
  update public.drivers set last_latitude=p_latitude,last_longitude=p_longitude,last_accuracy=p_accuracy,last_location_at=p_captured_at,updated_at=now() where id=p_driver_id;
  delete from public.driver_locations where driver_id=p_driver_id and order_id=p_order_id and captured_at < now()-interval '24 hours';
end $$;

create or replace function public.get_public_tracking(p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_driver public.drivers%rowtype;
begin
  select o.* into v_order from public.tracking_tokens t join public.orders o on o.id=t.order_id where t.token_hash=encode(digest(p_token,'sha256'),'hex') and t.revoked_at is null and t.expires_at>now();
  if not found then return null; end if;
  if v_order.driver_id is not null then select * into v_driver from public.drivers where id=v_order.driver_id; end if;
  return jsonb_build_object('orderId',v_order.id,'number',v_order.number,'status',v_order.status,'updatedAt',v_order.updated_at,'destination',jsonb_build_object('latitude',v_order.address->'latitude','longitude',v_order.address->'longitude'),'driver',case when v_driver.id is null then null else jsonb_build_object('latitude',v_driver.last_latitude,'longitude',v_driver.last_longitude,'lastLocationAt',v_driver.last_location_at) end);
end $$;

create or replace function public.audit_immutable() returns trigger language plpgsql as $$ begin raise exception 'Audit logs are immutable'; end $$;
create trigger audit_no_update before update or delete on public.audit_logs for each row execute function public.audit_immutable();

-- RLS: public menu reads; authenticated operational reads/writes by role; service-role bypasses RLS.
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.pizza_flavors enable row level security;
alter table public.addons enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.tabs enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.payments enable row level security;
alter table public.inventory_items enable row level security;
alter table public.coupons enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_ledger enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_locations enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using (id=auth.uid() or public.current_role()='manager');
create policy menu_public_flavors on public.pizza_flavors for select to anon,authenticated using (active);
create policy menu_public_addons on public.addons for select to anon,authenticated using (active);
create policy menu_public_products on public.products for select to anon,authenticated using (active);
create policy menu_public_categories on public.categories for select to anon,authenticated using (active);
create policy operational_orders on public.orders for select to authenticated using (public.can_manage_operation() or public.current_role() in ('driver','finance','viewer'));
create policy operational_order_items on public.order_items for select to authenticated using (public.can_manage_operation() or public.current_role() in ('driver','finance','viewer'));
create policy operational_tables on public.restaurant_tables for all to authenticated using (public.can_manage_operation()) with check (public.can_manage_operation());
create policy operational_tabs on public.tabs for all to authenticated using (public.can_manage_operation()) with check (public.can_manage_operation());
create policy manager_customers on public.customers for all to authenticated using (public.current_role() in ('manager','counter')) with check (public.current_role() in ('manager','counter'));
create policy manager_addresses on public.customer_addresses for all to authenticated using (public.current_role() in ('manager','counter')) with check (public.current_role() in ('manager','counter'));
create policy finance_payments on public.payments for select to authenticated using (public.current_role() in ('manager','counter','finance'));
create policy inventory_operation on public.inventory_items for all to authenticated using (public.current_role() in ('manager','counter')) with check (public.current_role() in ('manager','counter'));
create policy coupon_management on public.coupons for all to authenticated using (public.current_role() in ('manager','counter')) with check (public.current_role() in ('manager','counter'));
create policy loyalty_internal_accounts on public.loyalty_accounts for select to authenticated using (public.current_role() in ('manager','counter'));
create policy loyalty_internal_ledger on public.loyalty_ledger for select to authenticated using (public.current_role() in ('manager','counter'));
create policy drivers_operation on public.drivers for select to authenticated using (public.current_role() in ('manager','counter','driver'));
create policy driver_locations_restricted on public.driver_locations for select to authenticated using (public.current_role() in ('manager','counter','driver'));
create policy audit_manager on public.audit_logs for select to authenticated using (public.current_role()='manager');

revoke all on public.loyalty_accounts,public.loyalty_ledger from anon;
revoke all on public.audit_logs from anon,authenticated;
grant select on public.audit_logs to authenticated;
grant execute on function public.get_public_tracking(text) to anon,authenticated;
grant execute on function public.create_order_transaction(jsonb) to service_role;
grant execute on function public.change_order_status(text,public.order_status,text) to authenticated,service_role;
grant execute on function public.record_driver_location(uuid,text,numeric,numeric,numeric,timestamptz) to authenticated,service_role;
grant execute on function public.redeem_loyalty_reward(uuid,text,uuid) to authenticated,service_role;

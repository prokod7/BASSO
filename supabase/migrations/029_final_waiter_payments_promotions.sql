-- 029_final_waiter_payments_promotions.sql
-- Patch final Basso: promoções agendadas, novos meios de pagamento internos
-- e correção da conciliação de pagamentos manuais.

-- Os valores antigos permanecem para preservar o histórico.
alter type public.payment_method add value if not exists 'vr_refeicao';
alter type public.payment_method add value if not exists 'vr_alimentacao';
alter type public.payment_method add value if not exists 'sodexo';
alter type public.payment_method add value if not exists 'pluxe';
alter type public.payment_method add value if not exists 'alelo_refeicao';
alter type public.payment_method add value if not exists 'ticket_restaurante';
alter type public.payment_method add value if not exists 'voucher';

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text not null default '',
  badge_text text not null default 'Promoção do dia',
  image_url text,
  promo_price_cents integer not null check (promo_price_cents >= 0),
  active boolean not null default true,
  paused boolean not null default false,
  channels public.order_channel[] not null default array['own_delivery','pickup','counter','dine_in','table_qr']::public.order_channel[],
  days_of_week smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  starts_on date,
  ends_on date,
  start_time time without time zone,
  end_time time without time zone,
  pizza_size text check (pizza_size is null or pizza_size in ('grande','broto')),
  allow_coupon_stack boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint promotions_date_range_check check (starts_on is null or ends_on is null or starts_on <= ends_on),
  constraint promotions_days_check check (cardinality(days_of_week) between 1 and 7)
);

create table if not exists public.promotion_targets (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  product_id text references public.products(id) on delete cascade,
  flavor_id text references public.pizza_flavors(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint promotion_targets_exactly_one_check check ((product_id is not null) <> (flavor_id is not null))
);

create unique index if not exists promotion_targets_product_unique
  on public.promotion_targets(promotion_id, product_id)
  where product_id is not null;
create unique index if not exists promotion_targets_flavor_unique
  on public.promotion_targets(promotion_id, flavor_id)
  where flavor_id is not null;
create index if not exists promotions_runtime_idx
  on public.promotions(active, paused, starts_on, ends_on, sort_order)
  where deleted_at is null;
create index if not exists promotion_targets_promotion_idx
  on public.promotion_targets(promotion_id);
create index if not exists promotion_targets_product_idx
  on public.promotion_targets(product_id)
  where product_id is not null;
create index if not exists promotion_targets_flavor_idx
  on public.promotion_targets(flavor_id)
  where flavor_id is not null;

alter table public.promotions enable row level security;
alter table public.promotion_targets enable row level security;

-- Não há policy pública propositalmente: leitura pública e CRUD passam pelas rotas
-- server-side do PedidoPro, usando apenas os campos estritamente necessários.

create or replace function public.record_order_payment_transaction(
  p_order_id text,
  p_method public.payment_method,
  p_amount integer,
  p_idempotency_key text,
  p_actor_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order public.orders%rowtype;
  v_payment_id uuid;
  v_paid integer;
  v_new_status public.payment_status;
  v_session uuid;
  v_balance integer;
begin
  if p_amount <= 0 then raise exception 'Valor inválido'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;

  select id into v_payment_id from public.payments where idempotency_key = p_idempotency_key;
  if v_payment_id is not null then
    select coalesce(sum(amount_cents),0) into v_paid
      from public.payments where order_id = p_order_id and status = 'paid';
    return jsonb_build_object(
      'paymentId', v_payment_id,
      'paidAmount', v_paid,
      'paymentStatus', v_order.payment_status,
      'duplicate', true
    );
  end if;

  select coalesce(sum(amount_cents),0) into v_paid
    from public.payments where order_id = p_order_id and status = 'paid';
  v_balance := greatest(0, v_order.total_cents - v_paid);
  if v_balance <= 0 then raise exception 'Pedido já está integralmente pago'; end if;
  if p_amount > v_balance then raise exception 'Pagamento excede o saldo pendente do pedido'; end if;

  insert into public.payments(order_id, method, status, amount_cents, provider, idempotency_key, metadata, created_by)
  values(p_order_id, p_method, 'paid', p_amount, 'manual', p_idempotency_key, p_metadata, p_actor_id)
  returning id into v_payment_id;

  v_paid := v_paid + p_amount;
  v_new_status := case
    when v_paid >= v_order.total_cents then 'paid'::public.payment_status
    else 'partial'::public.payment_status
  end;

  update public.orders
  set payment_status = v_new_status,
      change_for_cents = case
        when p_method = 'cash' and nullif(p_metadata->>'changeFor','') is not null
          then greatest(v_order.total_cents, (p_metadata->>'changeFor')::integer)
        else change_for_cents
      end,
      updated_at = now(),
      updated_by = p_actor_id,
      version = version + 1
  where id = p_order_id;

  -- Caixa físico recebe somente dinheiro. Pix, cartões e vouchers não viram numerário.
  if p_method = 'cash' then
    select id into v_session from public.cash_sessions
      where status = 'open' order by opened_at desc limit 1 for update;
    if v_session is null then raise exception 'Abra o caixa antes de receber em dinheiro'; end if;
    insert into public.cash_movements(session_id, kind, amount_cents, reason, payment_id, created_by)
    values(v_session, 'sale', p_amount, 'Recebimento do pedido #' || v_order.number, v_payment_id, p_actor_id);
  end if;

  insert into public.audit_logs(actor_id, actor_label, action, entity_type, entity_id, after_data)
  values(
    p_actor_id,
    coalesce((select display_name from public.profiles where id = p_actor_id), 'Sistema'),
    'ORDER_PAYMENT_RECORDED',
    'payment',
    v_payment_id::text,
    jsonb_build_object('orderId', p_order_id, 'method', p_method, 'amount', p_amount, 'paidAmount', v_paid)
  );

  return jsonb_build_object(
    'paymentId', v_payment_id,
    'paidAmount', v_paid,
    'paymentStatus', v_new_status,
    'duplicate', false
  );
end
$$;

insert into public.system_migrations(version, name)
values (29, 'final_waiter_payments_promotions')
on conflict (version) do update set name = excluded.name;

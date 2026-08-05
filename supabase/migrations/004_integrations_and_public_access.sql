create sequence if not exists public.order_number_seq start 10000;
select setval('public.order_number_seq',greatest(coalesce((select max(number) from public.orders),9999),9999),true);
create or replace function public.assign_order_number() returns trigger language plpgsql as $$ begin new.number:=nextval('public.order_number_seq'); return new; end $$;
create trigger orders_assign_number before insert on public.orders for each row execute function public.assign_order_number();

create table public.order_access_tokens (
  order_id text primary key references public.orders(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default now()+interval '90 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.integration_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('ifood','99food')),
  external_id text not null,
  internal_kind text not null check (internal_kind in ('flavor','product','addon','combo','payment','status')),
  internal_id text not null,
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,external_id,internal_kind)
);

alter table public.integration_mappings enable row level security;
create policy integration_mapping_manager on public.integration_mappings for all to authenticated using (public.current_role()='manager') with check (public.current_role()='manager');

create or replace function public.get_public_order(p_order_id text,p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_items jsonb;
begin
  if not exists(select 1 from public.order_access_tokens where order_id=p_order_id and token_hash=encode(digest(p_token,'sha256'),'hex') and revoked_at is null and expires_at>now()) then return null; end if;
  select * into v_order from public.orders where id=p_order_id and deleted_at is null;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'name',name_snapshot,'quantity',quantity,'unitPrice',unit_price_cents,'productId',product_id,'selection',selection) order by created_at),'[]'::jsonb) into v_items from public.order_items where order_id=p_order_id;
  return jsonb_build_object('id',v_order.id,'number',v_order.number,'channel',v_order.channel,'status',v_order.status,'paymentStatus',v_order.payment_status,'customerName',v_order.customer_name,'customerPhone',v_order.customer_phone,'address',v_order.address,'items',v_items,'subtotal',v_order.subtotal_cents,'discount',v_order.discount_cents,'deliveryFee',v_order.delivery_fee_cents,'total',v_order.total_cents,'paymentMethod',v_order.payment_method,'notes',v_order.notes,'createdAt',v_order.created_at,'updatedAt',v_order.updated_at,'sourceIdempotencyKey',v_order.source_idempotency_key);
end $$;
grant execute on function public.get_public_order(text,text) to anon,authenticated;

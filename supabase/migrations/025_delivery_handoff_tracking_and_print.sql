-- 025_delivery_handoff_tracking_and_print.sql
-- MU15: retirada do pedido por QR/código, confirmação de entrega por código do
-- cliente e base segura para os novos templates térmicos de entrega/cozinha.

begin;

create table if not exists public.delivery_verifications (
  order_id text primary key references public.orders(id) on delete cascade,
  pickup_token text not null unique,
  pickup_code text not null,
  delivery_code text not null,
  pickup_attempts integer not null default 0,
  delivery_attempts integer not null default 0,
  pickup_locked_until timestamptz,
  delivery_locked_until timestamptz,
  pickup_verified_at timestamptz,
  pickup_verified_by uuid references public.profiles(id) on delete set null,
  pickup_verified_driver_id uuid references public.drivers(id) on delete set null,
  delivery_verified_at timestamptz,
  delivery_verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_verifications_pickup_code_check check (pickup_code ~ '^[0-9]{6}$'),
  constraint delivery_verifications_delivery_code_check check (delivery_code ~ '^[0-9]{6}$')
);

create index if not exists delivery_verifications_pickup_pending_idx
  on public.delivery_verifications(pickup_verified_at,created_at desc);
create index if not exists delivery_verifications_delivery_pending_idx
  on public.delivery_verifications(delivery_verified_at,created_at desc);

alter table public.delivery_verifications enable row level security;
revoke all on table public.delivery_verifications from public, anon, authenticated;
grant all on table public.delivery_verifications to service_role;

create or replace function public.ensure_delivery_verification_row() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.channel='own_delivery' then
    insert into public.delivery_verifications(order_id,pickup_token,pickup_code,delivery_code)
    values(
      new.id,
      encode(gen_random_bytes(24),'hex'),
      lpad((100000 + floor(random()*900000))::integer::text,6,'0'),
      lpad((100000 + floor(random()*900000))::integer::text,6,'0')
    )
    on conflict(order_id) do nothing;
  end if;
  return new;
end $$;

revoke execute on function public.ensure_delivery_verification_row() from public, anon, authenticated;
grant execute on function public.ensure_delivery_verification_row() to service_role;

drop trigger if exists orders_ensure_delivery_verification on public.orders;
create trigger orders_ensure_delivery_verification
  after insert or update of channel on public.orders
  for each row execute function public.ensure_delivery_verification_row();

insert into public.delivery_verifications(order_id,pickup_token,pickup_code,delivery_code)
select
  o.id,
  encode(gen_random_bytes(24),'hex'),
  lpad((100000 + floor(random()*900000))::integer::text,6,'0'),
  lpad((100000 + floor(random()*900000))::integer::text,6,'0')
from public.orders o
where o.channel='own_delivery' and o.deleted_at is null
on conflict(order_id) do nothing;

create or replace function public.verify_delivery_pickup(
  p_order_id text,
  p_driver_id uuid,
  p_code text default null,
  p_token text default null,
  p_actor_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_order public.orders%rowtype;
  v_verification public.delivery_verifications%rowtype;
  v_ok boolean;
begin
  select * into v_order from public.orders where id=p_order_id and deleted_at is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.channel<>'own_delivery' then raise exception 'Validação disponível somente para entrega própria'; end if;
  if v_order.status<>'ready' then raise exception 'Pedido precisa estar pronto para retirada'; end if;
  if v_order.driver_id is null or v_order.driver_id<>p_driver_id then raise exception 'Este pedido não está atribuído a este motoboy'; end if;
  if not exists(select 1 from public.driver_shifts where driver_id=p_driver_id and status='active') then
    raise exception 'Inicie o turno antes de retirar o pedido';
  end if;

  select * into v_verification from public.delivery_verifications where order_id=p_order_id for update;
  if not found then raise exception 'Código de retirada não foi gerado'; end if;
  if v_verification.pickup_verified_at is not null then
    return jsonb_build_object('ok',true,'alreadyVerified',true,'status','out_for_delivery');
  end if;
  if v_verification.pickup_locked_until is not null and v_verification.pickup_locked_until>now() then
    raise exception 'Validação temporariamente bloqueada. Aguarde alguns minutos';
  end if;

  v_ok := (nullif(trim(coalesce(p_token,'')),'') is not null and p_token=v_verification.pickup_token)
       or (nullif(trim(coalesce(p_code,'')),'') is not null and regexp_replace(p_code,'\D','','g')=v_verification.pickup_code);

  if not v_ok then
    update public.delivery_verifications
       set pickup_attempts=pickup_attempts+1,
           pickup_locked_until=case when pickup_attempts+1>=5 then now()+interval '5 minutes' else pickup_locked_until end,
           updated_at=now()
     where order_id=p_order_id;
    raise exception 'QR ou código de retirada inválido';
  end if;

  update public.delivery_verifications
     set pickup_verified_at=now(),pickup_verified_by=p_actor_id,pickup_verified_driver_id=p_driver_id,
         pickup_attempts=0,pickup_locked_until=null,updated_at=now()
   where order_id=p_order_id;

  perform public.change_order_status_controlled(
    p_order_id,
    'out_for_delivery'::public.order_status,
    'Retirada validada por QR/código do pedido',
    p_actor_id
  );

  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(
    p_actor_id,
    coalesce((select display_name from public.profiles where id=p_actor_id),(select name from public.drivers where id=p_driver_id),'Sistema'),
    'DELIVERY_PICKUP_VERIFIED','order',p_order_id,
    jsonb_build_object('driverId',p_driver_id,'verifiedAt',now())
  );

  return jsonb_build_object('ok',true,'alreadyVerified',false,'status','out_for_delivery');
end $$;

revoke execute on function public.verify_delivery_pickup(text,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.verify_delivery_pickup(text,uuid,text,text,uuid) to service_role;

create or replace function public.confirm_delivery_with_code(
  p_order_id text,
  p_driver_id uuid,
  p_code text,
  p_actor_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_order public.orders%rowtype;
  v_verification public.delivery_verifications%rowtype;
  v_code text;
begin
  select * into v_order from public.orders where id=p_order_id and deleted_at is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.channel<>'own_delivery' then raise exception 'Confirmação disponível somente para entrega própria'; end if;
  if v_order.status<>'out_for_delivery' then raise exception 'Pedido não está em rota'; end if;
  if v_order.driver_id is null or v_order.driver_id<>p_driver_id then raise exception 'Este pedido não está atribuído a este motoboy'; end if;
  if v_order.payment_status<>'paid' then raise exception 'Confirme o recebimento integral antes de concluir o pedido'; end if;

  select * into v_verification from public.delivery_verifications where order_id=p_order_id for update;
  if not found then raise exception 'Código de confirmação não foi gerado'; end if;
  if v_verification.delivery_verified_at is not null then
    return jsonb_build_object('ok',true,'alreadyVerified',true,'status','completed');
  end if;
  if v_verification.delivery_locked_until is not null and v_verification.delivery_locked_until>now() then
    raise exception 'Confirmação temporariamente bloqueada. Aguarde alguns minutos';
  end if;

  v_code := regexp_replace(coalesce(p_code,''),'\D','','g');
  if v_code<>v_verification.delivery_code then
    update public.delivery_verifications
       set delivery_attempts=delivery_attempts+1,
           delivery_locked_until=case when delivery_attempts+1>=5 then now()+interval '5 minutes' else delivery_locked_until end,
           updated_at=now()
     where order_id=p_order_id;
    raise exception 'Código de confirmação inválido';
  end if;

  update public.delivery_verifications
     set delivery_verified_at=now(),delivery_verified_by=p_actor_id,
         delivery_attempts=0,delivery_locked_until=null,updated_at=now()
   where order_id=p_order_id;

  perform public.change_order_status_controlled(
    p_order_id,
    'completed'::public.order_status,
    'Entrega confirmada pelo código do cliente',
    p_actor_id
  );

  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(
    p_actor_id,
    coalesce((select display_name from public.profiles where id=p_actor_id),(select name from public.drivers where id=p_driver_id),'Sistema'),
    'DELIVERY_CODE_CONFIRMED','order',p_order_id,
    jsonb_build_object('driverId',p_driver_id,'verifiedAt',now())
  );

  return jsonb_build_object('ok',true,'alreadyVerified',false,'status','completed');
end $$;

revoke execute on function public.confirm_delivery_with_code(text,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.confirm_delivery_with_code(text,uuid,text,uuid) to service_role;

-- O código de confirmação é exibido somente no link privado do próprio cliente,
-- que já exige order_access_token. Ele nunca é devolvido pelo endpoint do motoboy.
create or replace function public.get_public_order(p_order_id text, p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_items jsonb; v_delivery_code text;
begin
  if not exists(
    select 1 from public.order_access_tokens
    where order_id=p_order_id
      and token_hash=encode(digest(p_token,'sha256'),'hex')
      and revoked_at is null and expires_at>now()
  ) then return null; end if;

  select * into v_order from public.orders where id=p_order_id and deleted_at is null;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'kind',kind,'name',name_snapshot,'quantity',quantity,'unitPrice',unit_price_cents,
    'productId',product_id,'selection',selection
  ) order by created_at),'[]'::jsonb)
  into v_items from public.order_items where order_id=p_order_id;

  if v_order.channel='own_delivery' and v_order.status in ('ready','out_for_delivery') then
    select delivery_code into v_delivery_code from public.delivery_verifications where order_id=p_order_id;
  end if;

  return jsonb_build_object(
    'id',v_order.id,'number',v_order.number,'channel',v_order.channel,'status',v_order.status,
    'paymentStatus',v_order.payment_status,'customerName',v_order.customer_name,'customerPhone',v_order.customer_phone,
    'address',v_order.address,'items',v_items,'subtotal',v_order.subtotal_cents,'discount',v_order.discount_cents,
    'deliveryFee',v_order.delivery_fee_cents,'total',v_order.total_cents,'paymentMethod',v_order.payment_method,
    'notes',v_order.notes,'createdAt',v_order.created_at,'updatedAt',v_order.updated_at,
    'sourceIdempotencyKey',v_order.source_idempotency_key,'deliveryCode',v_delivery_code
  );
end $$;

insert into public.system_migrations(version,name)
values (25,'delivery_handoff_tracking_and_print')
on conflict(version) do update set name=excluded.name;

commit;

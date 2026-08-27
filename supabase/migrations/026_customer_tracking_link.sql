-- 026_customer_tracking_link.sql
-- Mantém o token bruto do rastreio somente em tabela protegida, para que o
-- próprio cliente possa recuperar o link via order_access_token. A API pública
-- de tracking continua validando apenas o hash.

begin;

alter table public.tracking_tokens add column if not exists token_value text;

-- tracking_tokens contém credencial temporária; browser roles não recebem
-- acesso direto. O valor só é devolvido pelo RPC get_public_order após validar
-- o token privado do próprio pedido.
revoke all on table public.tracking_tokens from anon, authenticated;
grant all on table public.tracking_tokens to service_role;

create or replace function public.get_public_order(p_order_id text, p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
  v_delivery_code text;
  v_tracking_token text;
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

  if v_order.channel='own_delivery' and v_order.status='out_for_delivery' then
    select token_value into v_tracking_token
    from public.tracking_tokens
    where order_id=p_order_id and revoked_at is null and expires_at>now() and customer_visible=true;
  end if;

  return jsonb_build_object(
    'id',v_order.id,'number',v_order.number,'channel',v_order.channel,'status',v_order.status,
    'paymentStatus',v_order.payment_status,'customerName',v_order.customer_name,'customerPhone',v_order.customer_phone,
    'address',v_order.address,'items',v_items,'subtotal',v_order.subtotal_cents,'discount',v_order.discount_cents,
    'deliveryFee',v_order.delivery_fee_cents,'total',v_order.total_cents,'paymentMethod',v_order.payment_method,
    'notes',v_order.notes,'createdAt',v_order.created_at,'updatedAt',v_order.updated_at,
    'sourceIdempotencyKey',v_order.source_idempotency_key,'deliveryCode',v_delivery_code,
    'trackingToken',v_tracking_token
  );
end $$;

insert into public.system_migrations(version,name)
values (26,'customer_tracking_link')
on conflict(version) do update set name=excluded.name;

commit;

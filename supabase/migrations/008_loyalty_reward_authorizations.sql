-- Secure internal reward authorization. Points and reward eligibility are never exposed publicly.
create table if not exists public.loyalty_reward_authorizations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  flavor_id text not null check (flavor_id in ('mozzarella','calabresa-tradicional')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','consumed','cancelled','expired')),
  expires_at timestamptz not null,
  ledger_id uuid not null references public.loyalty_ledger(id),
  consumed_order_id text references public.orders(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists loyalty_reward_authorizations_pending_idx on public.loyalty_reward_authorizations(status,expires_at);
alter table public.loyalty_reward_authorizations enable row level security;
create policy loyalty_reward_authorizations_internal on public.loyalty_reward_authorizations for select to authenticated using (public.current_role() in ('manager','counter'));
revoke all on public.loyalty_reward_authorizations from anon;

create or replace function public.authorize_loyalty_reward(
  p_customer_id uuid,
  p_flavor_id text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_actor_id uuid default auth.uid()
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_balance integer; v_ledger_id uuid; v_id uuid;
begin
  if p_flavor_id not in ('mozzarella','calabresa-tradicional') then raise exception 'Sabor não elegível'; end if;
  if p_expires_at <= now() or p_expires_at > now()+interval '24 hours' then raise exception 'Validade da autorização inválida'; end if;
  select balance into v_balance from public.loyalty_accounts where customer_id=p_customer_id for update;
  if coalesce(v_balance,0)<10 then raise exception 'Saldo insuficiente'; end if;
  v_balance:=v_balance-10;
  update public.loyalty_accounts set balance=v_balance,rewards_redeemed=rewards_redeemed+1,updated_at=now() where customer_id=p_customer_id;
  insert into public.loyalty_ledger(customer_id,delta,reason,balance_after,created_by)
  values(p_customer_id,-10,'reward_redemption',v_balance,p_actor_id) returning id into v_ledger_id;
  insert into public.loyalty_reward_authorizations(customer_id,flavor_id,token_hash,expires_at,ledger_id,created_by)
  values(p_customer_id,p_flavor_id,p_token_hash,p_expires_at,v_ledger_id,p_actor_id) returning id into v_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'LOYALTY_REWARD_AUTHORIZED','loyalty_reward_authorization',v_id::text,jsonb_build_object('customerId',p_customer_id,'flavorId',p_flavor_id,'balance',v_balance,'expiresAt',p_expires_at));
  return v_id;
end $$;

grant execute on function public.authorize_loyalty_reward(uuid,text,text,timestamptz,uuid) to authenticated,service_role;

create or replace function public.consume_order_with_reward_transaction(p_order jsonb,p_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_authorization public.loyalty_reward_authorizations%rowtype; v_order_customer uuid; v_reward jsonb; v_result jsonb;
begin
  select * into v_authorization from public.loyalty_reward_authorizations
  where token_hash=encode(digest(p_token,'sha256'),'hex') and status='pending' and expires_at>now()
  for update;
  if not found then raise exception 'Autorização de recompensa inválida ou expirada'; end if;
  if p_order->>'channel'<>'own_delivery' then raise exception 'A recompensa interna é exclusiva do delivery próprio'; end if;
  select value into v_reward from jsonb_array_elements(p_order->'items') where value->>'kind'='reward' limit 1;
  if v_reward is null then raise exception 'Item de recompensa ausente'; end if;
  if (select count(*) from jsonb_array_elements(p_order->'items') where value->>'kind'='reward')<>1 then raise exception 'Somente uma recompensa por pedido'; end if;
  if v_reward->'selection'->>'size'<>'grande' or v_reward->'selection'->>'flavorA'<>v_authorization.flavor_id then raise exception 'Recompensa divergente da autorização'; end if;
  if coalesce((v_reward->>'unitPrice')::integer,-1)<>0 then raise exception 'Recompensa deve ter preço base zero'; end if;
  perform set_config('app.reward_authorized','true',true);
  perform set_config('app.actor_id',coalesce(v_authorization.created_by::text,''),true);
  v_result:=public.create_order_transaction(p_order);
  select customer_id into v_order_customer from public.orders where id=p_order->>'id';
  if v_order_customer is distinct from v_authorization.customer_id then raise exception 'Cliente divergente da autorização'; end if;
  update public.loyalty_reward_authorizations set status='consumed',consumed_order_id=p_order->>'id',consumed_at=now() where id=v_authorization.id;
  update public.loyalty_ledger set order_id=p_order->>'id' where id=v_authorization.ledger_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(v_authorization.created_by,coalesce((select display_name from public.profiles where id=v_authorization.created_by),'Sistema'),'LOYALTY_REWARD_CONSUMED','loyalty_reward_authorization',v_authorization.id::text,jsonb_build_object('orderId',p_order->>'id'));
  return v_result;
end $$;

grant execute on function public.consume_order_with_reward_transaction(jsonb,text) to service_role;

create or replace function public.cancel_loyalty_reward_authorization(
  p_authorization_id uuid,
  p_reason text,
  p_actor_id uuid default auth.uid(),
  p_expired boolean default false
) returns integer
language plpgsql security definer set search_path=public as $$
declare v_authorization public.loyalty_reward_authorizations%rowtype; v_balance integer;
begin
  select * into v_authorization from public.loyalty_reward_authorizations where id=p_authorization_id and status='pending' for update;
  if not found then raise exception 'Autorização pendente não encontrada'; end if;
  select balance into v_balance from public.loyalty_accounts where customer_id=v_authorization.customer_id for update;
  v_balance:=least(15,coalesce(v_balance,0)+10);
  update public.loyalty_accounts set balance=v_balance,rewards_redeemed=greatest(0,rewards_redeemed-1),updated_at=now() where customer_id=v_authorization.customer_id;
  insert into public.loyalty_ledger(customer_id,delta,reason,balance_after,created_by)
  values(v_authorization.customer_id,10,'manual_correction',v_balance,p_actor_id);
  update public.loyalty_reward_authorizations set status=case when p_expired then 'expired' else 'cancelled' end,cancelled_at=now() where id=p_authorization_id;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),case when p_expired then 'LOYALTY_REWARD_EXPIRED' else 'LOYALTY_REWARD_CANCELLED' end,'loyalty_reward_authorization',p_authorization_id::text,p_reason,jsonb_build_object('balance',v_balance));
  return v_balance;
end $$;

grant execute on function public.cancel_loyalty_reward_authorization(uuid,text,uuid,boolean) to authenticated,service_role;

create or replace function public.expire_loyalty_reward_authorizations(p_limit integer default 100) returns integer
language plpgsql security definer set search_path=public as $$
declare v_row record; v_count integer:=0;
begin
  for v_row in select id from public.loyalty_reward_authorizations where status='pending' and expires_at<=now() order by expires_at limit p_limit for update skip locked loop
    perform public.cancel_loyalty_reward_authorization(v_row.id,'Autorização expirada automaticamente',null,true);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

grant execute on function public.expire_loyalty_reward_authorizations(integer) to service_role;

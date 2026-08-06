-- Mega Update Administrativo e Operacional
-- Controle total de pedidos, comunicação, ocorrências, pagamentos e estado da loja.

alter table public.orders add column if not exists priority text not null default 'normal'
  check (priority in ('normal','high','urgent'));
alter table public.orders add column if not exists estimated_ready_at timestamptz;
alter table public.orders add column if not exists viewed_at timestamptz;
alter table public.orders add column if not exists assigned_to uuid references public.profiles(id);
alter table public.orders add column if not exists internal_summary text check (char_length(internal_summary) <= 1000);
alter table public.orders add column if not exists version integer not null default 1;
alter table public.orders add column if not exists updated_by uuid references public.profiles(id);

alter table public.order_items add column if not exists updated_at timestamptz not null default now();
alter table public.order_items add column if not exists cancelled_reason text;
alter table public.order_items add column if not exists updated_by uuid references public.profiles(id);

create table if not exists public.order_internal_notes (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  pinned boolean not null default false,
  created_by uuid references public.profiles(id),
  created_by_label text,
  created_at timestamptz not null default now()
);
create index if not exists order_internal_notes_order_idx on public.order_internal_notes(order_id,created_at desc);

create table if not exists public.order_incidents (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  category text not null check (category in ('customer','address','payment','production','delivery','quality','other')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'open' check (status in ('open','resolved','cancelled')),
  resolution text,
  created_by uuid references public.profiles(id),
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists order_incidents_order_idx on public.order_incidents(order_id,status,created_at desc);

create table if not exists public.order_communication_logs (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  channel text not null check (channel in ('manual_whatsapp','phone','push','email','internal')),
  template_key text,
  recipient text,
  message_snapshot text not null,
  status text not null default 'opened' check (status in ('opened','sent','failed','cancelled')),
  created_by uuid references public.profiles(id),
  created_by_label text,
  created_at timestamptz not null default now()
);
create index if not exists order_communication_logs_order_idx on public.order_communication_logs(order_id,created_at desc);

create table if not exists public.communication_templates (
  key text primary key,
  name text not null,
  channel text not null default 'manual_whatsapp' check (channel in ('manual_whatsapp','push','email')),
  body text not null check (char_length(body) between 1 and 2000),
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.communication_templates(key,name,body,sort_order) values
  ('confirmation','Pedido confirmado','Olá, {cliente}! Seu pedido #{numero} foi confirmado pela La Forneria Basso.',10),
  ('preparing','Pedido em preparo','Olá, {cliente}! Seu pedido #{numero} já está em preparo.',20),
  ('ready','Pedido pronto','Olá, {cliente}! Seu pedido #{numero} está pronto.',30),
  ('out_for_delivery','Saiu para entrega','Olá, {cliente}! Seu pedido #{numero} saiu para entrega.',40),
  ('address','Confirmar endereço','Olá, {cliente}! Precisamos confirmar o endereço do pedido #{numero}: {endereco}.',50),
  ('delay','Informar atraso','Olá, {cliente}! O pedido #{numero} teve um pequeno atraso. A nova previsão é {previsao}.',60),
  ('pix','Enviar dados do Pix','Olá, {cliente}! Para o pedido #{numero}, a chave Pix é {pix}. Envie o comprovante após o pagamento.',70),
  ('tracking','Acompanhamento da entrega','Olá, {cliente}! Acompanhe o pedido #{numero}: {rastreamento}',80),
  ('cancelled','Pedido cancelado','Olá, {cliente}. Precisamos falar sobre o cancelamento do pedido #{numero}.',90),
  ('thanks','Agradecimento','Obrigado pelo pedido #{numero}, {cliente}! Esperamos que aproveite. La Forneria Basso.',100)
on conflict (key) do nothing;

create table if not exists public.store_runtime_status (
  id boolean primary key default true check (id),
  operational_status text not null default 'closed' check (operational_status in ('open','paused','closed')),
  accepting_orders boolean not null default false,
  pause_reason text,
  manual_override boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.store_runtime_status(id) values(true) on conflict (id) do nothing;

create or replace function public.recalculate_order_totals(p_order_id text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_subtotal integer; v_discount integer; v_fee integer; v_total integer;
begin
  select coalesce(sum(quantity * unit_price_cents) filter (where production_status <> 'cancelled'),0)
    into v_subtotal from public.order_items where order_id=p_order_id;
  select discount_cents,delivery_fee_cents into v_discount,v_fee from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  v_discount:=least(coalesce(v_discount,0),v_subtotal);
  v_total:=greatest(0,v_subtotal-v_discount+coalesce(v_fee,0));
  update public.orders set subtotal_cents=v_subtotal,discount_cents=v_discount,total_cents=v_total,
    version=version+1,updated_at=now() where id=p_order_id;
  return jsonb_build_object('subtotal',v_subtotal,'discount',v_discount,'deliveryFee',v_fee,'total',v_total);
end $$;

create or replace function public.manage_order_item_transaction(
  p_order_id text,
  p_item_id text,
  p_action text,
  p_value jsonb default '{}'::jsonb,
  p_reason text default null,
  p_actor_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_before public.order_items%rowtype; v_after public.order_items%rowtype; v_totals jsonb; v_qty integer; v_notes text;
begin
  select * into v_before from public.order_items where id=p_item_id and order_id=p_order_id for update;
  if not found then raise exception 'Item não encontrado'; end if;
  if p_action in ('quantity','cancel','restore') and coalesce(trim(p_reason),'')='' then raise exception 'Motivo obrigatório'; end if;

  if p_action='quantity' then
    v_qty:=(p_value->>'quantity')::integer;
    if v_qty < 1 or v_qty > 99 then raise exception 'Quantidade inválida'; end if;
    update public.order_items set quantity=v_qty,updated_at=now(),updated_by=p_actor_id where id=p_item_id;
  elsif p_action='notes' then
    v_notes:=coalesce(p_value->>'notes','');
    if char_length(v_notes)>500 then raise exception 'Observação excede 500 caracteres'; end if;
    update public.order_items set selection=jsonb_set(coalesce(selection,'{}'::jsonb),'{notes}',to_jsonb(v_notes),true),updated_at=now(),updated_by=p_actor_id where id=p_item_id;
  elsif p_action='cancel' then
    update public.order_items set production_status='cancelled',cancelled_reason=p_reason,updated_at=now(),updated_by=p_actor_id where id=p_item_id;
  elsif p_action='restore' then
    update public.order_items set production_status='queued',cancelled_reason=null,updated_at=now(),updated_by=p_actor_id where id=p_item_id;
  elsif p_action='production_status' then
    if coalesce(p_value->>'status','') not in ('queued','preparing','ready','cancelled') then raise exception 'Status de produção inválido'; end if;
    update public.order_items set production_status=(p_value->>'status'),updated_at=now(),updated_by=p_actor_id where id=p_item_id;
  else
    raise exception 'Ação de item inválida';
  end if;

  select * into v_after from public.order_items where id=p_item_id;
  v_totals:=public.recalculate_order_totals(p_order_id);
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'ORDER_ITEM_'||upper(p_action),'order_item',p_item_id,p_reason,to_jsonb(v_before),to_jsonb(v_after));
  return jsonb_build_object('item',to_jsonb(v_after),'totals',v_totals);
end $$;

create or replace function public.record_order_payment_transaction(
  p_order_id text,
  p_method public.payment_method,
  p_amount integer,
  p_idempotency_key text,
  p_actor_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_payment_id uuid; v_paid integer; v_new_status public.payment_status; v_session uuid;
begin
  if p_amount<=0 then raise exception 'Valor inválido'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  select id into v_payment_id from public.payments where idempotency_key=p_idempotency_key;
  if v_payment_id is not null then
    select coalesce(sum(amount_cents),0) into v_paid from public.payments where order_id=p_order_id and status='paid';
    return jsonb_build_object('paymentId',v_payment_id,'paidAmount',v_paid,'paymentStatus',v_order.payment_status,'duplicate',true);
  end if;
  insert into public.payments(order_id,method,status,amount_cents,provider,idempotency_key,metadata,created_by)
  values(p_order_id,p_method,'paid',p_amount,'manual',p_idempotency_key,p_metadata,p_actor_id) returning id into v_payment_id;
  select coalesce(sum(amount_cents),0) into v_paid from public.payments where order_id=p_order_id and status='paid';
  v_new_status:=case when v_paid>=v_order.total_cents then 'paid'::public.payment_status else 'partial'::public.payment_status end;
  update public.orders set payment_status=v_new_status,updated_at=now(),updated_by=p_actor_id,version=version+1 where id=p_order_id;
  select id into v_session from public.cash_sessions where status='open' order by opened_at desc limit 1;
  if v_session is not null then
    insert into public.cash_movements(session_id,kind,amount_cents,reason,payment_id,created_by)
    values(v_session,'sale',p_amount,'Recebimento do pedido #'||v_order.number,v_payment_id,p_actor_id);
  end if;
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'ORDER_PAYMENT_RECORDED','payment',v_payment_id::text,jsonb_build_object('orderId',p_order_id,'method',p_method,'amount',p_amount,'paidAmount',v_paid));
  return jsonb_build_object('paymentId',v_payment_id,'paidAmount',v_paid,'paymentStatus',v_new_status,'duplicate',false);
end $$;



create or replace function public.change_order_status_controlled(
  p_order_id text,
  p_status public.order_status,
  p_reason text default null,
  p_actor_id uuid default null
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_old public.order_status;
  v_channel public.order_channel;
  v_customer uuid;
  v_payment public.payment_status;
  v_balance integer;
  v_old_rank integer;
  v_new_rank integer;
begin
  select status,channel,customer_id,payment_status
    into v_old,v_channel,v_customer,v_payment
    from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if p_status=v_old then return; end if;
  if p_status='out_for_delivery' and v_channel not in ('own_delivery','ifood','99food') then
    raise exception 'Status não permitido para o canal';
  end if;
  if p_status='completed' and v_payment<>'paid' then
    raise exception 'Confirme o recebimento integral antes de concluir o pedido';
  end if;

  v_old_rank:=case v_old when 'received' then 1 when 'confirmed' then 2 when 'preparing' then 3 when 'ready' then 4 when 'out_for_delivery' then 5 when 'completed' then 6 else 7 end;
  v_new_rank:=case p_status when 'received' then 1 when 'confirmed' then 2 when 'preparing' then 3 when 'ready' then 4 when 'out_for_delivery' then 5 when 'completed' then 6 else 7 end;
  if (p_status='cancelled' or v_new_rank<v_old_rank or v_new_rank>v_old_rank+1) and coalesce(trim(p_reason),'')='' then
    raise exception 'Motivo obrigatório para cancelar, retornar ou saltar etapas';
  end if;

  update public.orders
     set status=p_status,
         updated_at=now(),
         updated_by=p_actor_id,
         version=version+1,
         completed_at=case when p_status='completed' then now() when v_old='completed' then null else completed_at end
   where id=p_order_id;

  insert into public.order_status_history(order_id,from_status,to_status,reason,actor_id,source)
  values(p_order_id,v_old,p_status,p_reason,p_actor_id,'operation');
  insert into public.audit_logs(actor_id,actor_label,action,entity_type,entity_id,reason,before_data,after_data)
  values(p_actor_id,coalesce((select display_name from public.profiles where id=p_actor_id),'Sistema'),'ORDER_STATUS_CHANGED','order',p_order_id,p_reason,jsonb_build_object('status',v_old),jsonb_build_object('status',p_status));

  if p_status in ('completed','cancelled') then
    update public.drivers set available=true,active_order_id=null,updated_at=now() where active_order_id=p_order_id;
    update public.tracking_tokens set revoked_at=coalesce(revoked_at,now()) where order_id=p_order_id;
  end if;

  if p_status='completed' and v_old<>'completed' and v_channel='own_delivery' and v_payment='paid' and v_customer is not null then
    insert into public.loyalty_accounts(customer_id) values(v_customer) on conflict do nothing;
    select balance into v_balance from public.loyalty_accounts where customer_id=v_customer for update;
    if not exists(select 1 from public.loyalty_ledger where order_id=p_order_id and reason='eligible_order') then
      v_balance:=least(15,v_balance+1);
      update public.loyalty_accounts set balance=v_balance,lifetime_points=lifetime_points+1,updated_at=now() where customer_id=v_customer;
      insert into public.loyalty_ledger(customer_id,order_id,delta,reason,balance_after,created_by)
      values(v_customer,p_order_id,1,'eligible_order',v_balance,p_actor_id);
    end if;
  end if;
end $$;

alter table public.order_internal_notes enable row level security;
alter table public.order_incidents enable row level security;
alter table public.order_communication_logs enable row level security;
alter table public.communication_templates enable row level security;
alter table public.store_runtime_status enable row level security;

drop policy if exists order_internal_notes_operation on public.order_internal_notes;
create policy order_internal_notes_operation on public.order_internal_notes for select to authenticated
  using (public.current_role() in ('manager','counter','waiter','kitchen','bar','finance','viewer'));
drop policy if exists order_incidents_operation on public.order_incidents;
create policy order_incidents_operation on public.order_incidents for select to authenticated
  using (public.current_role() in ('manager','counter','waiter','kitchen','bar','driver','finance','viewer'));
drop policy if exists order_communication_logs_operation on public.order_communication_logs;
create policy order_communication_logs_operation on public.order_communication_logs for select to authenticated
  using (public.current_role() in ('manager','counter','waiter','finance','viewer'));
drop policy if exists communication_templates_operation on public.communication_templates;
create policy communication_templates_operation on public.communication_templates for select to authenticated using (true);
drop policy if exists store_runtime_status_operation on public.store_runtime_status;
create policy store_runtime_status_operation on public.store_runtime_status for select to authenticated using (true);

grant select on public.order_internal_notes,public.order_incidents,public.order_communication_logs,public.communication_templates,public.store_runtime_status to authenticated,service_role;
grant execute on function public.change_order_status_controlled(text,public.order_status,text,uuid) to authenticated,service_role;
grant execute on function public.recalculate_order_totals(text) to authenticated,service_role;
grant execute on function public.manage_order_item_transaction(text,text,text,jsonb,text,uuid) to authenticated,service_role;
grant execute on function public.record_order_payment_transaction(text,public.payment_method,integer,text,uuid,jsonb) to authenticated,service_role;

-- Queue claiming and provider-safe marketplace persistence.
create unique index if not exists orders_marketplace_external_unique
  on public.orders(channel, external_id)
  where external_id is not null and channel in ('ifood','99food');

alter table public.integration_events add column if not exists claimed_at timestamptz;
alter table public.print_jobs add column if not exists claimed_at timestamptz;
alter table public.notification_jobs add column if not exists claimed_at timestamptz;

create or replace function public.claim_integration_events(p_limit integer default 10)
returns setof public.integration_events
language plpgsql security definer set search_path=public as $$
begin
  return query
  with claimed as (
    select id from public.integration_events
    where (
        (status in ('pending','failed') and coalesce(next_attempt_at,created_at) <= now())
        or (status='processing' and claimed_at < now()-interval '10 minutes')
      )
      and attempts < 8
    order by created_at
    for update skip locked
    limit greatest(1,least(p_limit,50))
  )
  update public.integration_events e
  set status='processing', attempts=e.attempts+1, claimed_at=now()
  from claimed c where e.id=c.id
  returning e.*;
end $$;

grant execute on function public.claim_integration_events(integer) to service_role;

create or replace function public.finish_integration_event(
  p_id uuid,
  p_success boolean,
  p_error text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare v_attempts integer;
begin
  select attempts into v_attempts from public.integration_events where id=p_id for update;
  if not found then raise exception 'Evento não encontrado'; end if;
  update public.integration_events
  set status=case when p_success then 'done' when v_attempts>=8 then 'dead_letter' else 'failed' end,
      last_error=case when p_success then null else left(coalesce(p_error,'Falha desconhecida'),2000) end,
      next_attempt_at=case when p_success or v_attempts>=8 then null else now() + make_interval(secs => least(3600, power(2,v_attempts)::integer * 15)) end,
      processed_at=case when p_success then now() else processed_at end,
      claimed_at=null
  where id=p_id;
end $$;

grant execute on function public.finish_integration_event(uuid,boolean,text) to service_role;

create or replace function public.claim_print_jobs(p_bridge_key text,p_limit integer default 5)
returns setof public.print_jobs
language plpgsql security definer set search_path=public as $$
begin
  if p_bridge_key is null or p_bridge_key='' then raise exception 'Chave do bridge obrigatória'; end if;
  return query
  with claimed as (
    select id from public.print_jobs
    where (
        (status in ('queued','failed') and coalesce(next_attempt_at,created_at) <= now())
        or (status='processing' and claimed_at < now()-interval '10 minutes')
      )
      and attempts < 8
    order by created_at
    for update skip locked
    limit greatest(1,least(p_limit,20))
  )
  update public.print_jobs p
  set status='processing', attempts=p.attempts+1, claimed_at=now()
  from claimed c where p.id=c.id
  returning p.*;
end $$;

grant execute on function public.claim_print_jobs(text,integer) to service_role;

create or replace function public.finish_print_job(p_id uuid,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_attempts integer;
begin
  select attempts into v_attempts from public.print_jobs where id=p_id for update;
  if not found then raise exception 'Trabalho de impressão não encontrado'; end if;
  update public.print_jobs
  set status=case when p_success then 'done'::public.job_status when v_attempts>=8 then 'cancelled'::public.job_status else 'failed'::public.job_status end,
      last_error=case when p_success then null else left(coalesce(p_error,'Falha desconhecida'),2000) end,
      next_attempt_at=case when p_success or v_attempts>=8 then null else now() + make_interval(secs => least(1800, power(2,v_attempts)::integer * 10)) end,
      processed_at=case when p_success then now() else processed_at end,
      claimed_at=null
  where id=p_id;
end $$;

grant execute on function public.finish_print_job(uuid,boolean,text) to service_role;

create or replace function public.claim_notification_jobs(p_limit integer default 20)
returns setof public.notification_jobs
language plpgsql security definer set search_path=public as $$
begin
  return query
  with claimed as (
    select id from public.notification_jobs
    where channel in ('push','email')
      and (
        (status in ('queued','failed') and scheduled_at <= now())
        or (status='processing' and claimed_at < now()-interval '10 minutes')
      )
      and attempts < 8
    order by scheduled_at
    for update skip locked
    limit greatest(1,least(p_limit,100))
  )
  update public.notification_jobs n
  set status='processing',attempts=n.attempts+1,claimed_at=now()
  from claimed c where n.id=c.id
  returning n.*;
end $$;

grant execute on function public.claim_notification_jobs(integer) to service_role;

create or replace function public.finish_notification_job(p_id uuid,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_attempts integer;
begin
  select attempts into v_attempts from public.notification_jobs where id=p_id for update;
  if not found then raise exception 'Notificação não encontrada'; end if;
  update public.notification_jobs
  set status=case when p_success then 'done'::public.job_status when v_attempts>=8 then 'cancelled'::public.job_status else 'failed'::public.job_status end,
      last_error=case when p_success then null else left(coalesce(p_error,'Falha desconhecida'),2000) end,
      scheduled_at=case when p_success or v_attempts>=8 then scheduled_at else now() + make_interval(secs => least(3600,power(2,v_attempts)::integer*15)) end,
      claimed_at=null
  where id=p_id;
end $$;

grant execute on function public.finish_notification_job(uuid,boolean,text) to service_role;

create or replace function public.enqueue_order_print_jobs(p_order_id text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0; v_sector text; v_payload jsonb;
begin
  if not exists(select 1 from public.orders where id=p_order_id) then raise exception 'Pedido não encontrado'; end if;
  for v_sector in select distinct sector from public.order_items where order_id=p_order_id and production_status<>'cancelled' loop
    select jsonb_build_object(
      'order',(select to_jsonb(o) from public.orders o where o.id=p_order_id),
      'items',coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb)
    ) into v_payload
    from public.order_items i where i.order_id=p_order_id and i.sector=v_sector and i.production_status<>'cancelled';
    insert into public.print_jobs(order_id,sector,printer_key,payload)
    select p_order_id,v_sector,case when v_sector='bar' then 'bar' else 'cozinha' end,v_payload
    where not exists(select 1 from public.print_jobs where order_id=p_order_id and sector=v_sector and not is_reprint);
    if found then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end $$;

grant execute on function public.enqueue_order_print_jobs(text) to authenticated,service_role;


create or replace function public.create_marketplace_order_transaction(p_order jsonb,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id text:=p_order->>'id'; v_item jsonb;
begin
  if p_order->>'channel' not in ('ifood','99food') then raise exception 'Canal de marketplace inválido'; end if;
  if exists(select 1 from public.orders where source_idempotency_key=p_order->>'source_idempotency_key') then
    return jsonb_build_object('id',(select id from public.orders where source_idempotency_key=p_order->>'source_idempotency_key'),'duplicate',true);
  end if;
  insert into public.orders(
    id,number,channel,status,payment_status,customer_name,customer_phone,address,
    subtotal_cents,discount_cents,delivery_fee_cents,total_cents,payment_method,
    source_idempotency_key,external_id,external_payload,created_at,updated_at
  ) values(
    v_id,1,(p_order->>'channel')::public.order_channel,(p_order->>'status')::public.order_status,
    (p_order->>'payment_status')::public.payment_status,p_order->>'customer_name',coalesce(p_order->>'customer_phone',''),
    p_order->'address',(p_order->>'subtotal_cents')::integer,(p_order->>'discount_cents')::integer,
    (p_order->>'delivery_fee_cents')::integer,(p_order->>'total_cents')::integer,
    (p_order->>'payment_method')::public.payment_method,p_order->>'source_idempotency_key',
    p_order->>'external_id',p_order->'external_payload',coalesce((p_order->>'created_at')::timestamptz,now()),now()
  );
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.order_items(id,order_id,kind,name_snapshot,quantity,unit_price_cents,product_id,selection,sector)
    values(v_item->>'id',v_id,v_item->>'kind',v_item->>'name_snapshot',(v_item->>'quantity')::integer,
      (v_item->>'unit_price_cents')::integer,nullif(v_item->>'product_id',''),v_item->'selection',v_item->>'sector');
  end loop;
  insert into public.order_status_history(order_id,to_status,source)
  values(v_id,'received',p_order->>'channel'||'_webhook');
  insert into public.audit_logs(actor_label,action,entity_type,entity_id,origin,after_data)
  values('Integração','MARKETPLACE_ORDER_CREATED','order',v_id,p_order->>'channel',jsonb_build_object('externalId',p_order->>'external_id'));
  perform public.enqueue_order_print_jobs(v_id);
  return jsonb_build_object('id',v_id,'duplicate',false);
exception when unique_violation then
  return jsonb_build_object('id',coalesce((select id from public.orders where source_idempotency_key=p_order->>'source_idempotency_key'),v_id),'duplicate',true);
end $$;

grant execute on function public.create_marketplace_order_transaction(jsonb,jsonb) to service_role;

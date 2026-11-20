create table public.wa_owner_pin (
  singleton boolean primary key default true check (singleton),
  pin_hash text not null
);
create table public.wa_pin_attempts (
  actor uuid primary key,
  failures integer not null default 0,
  next_try timestamptz
);
alter table public.wa_owner_pin enable row level security;
alter table public.wa_pin_attempts enable row level security;
revoke all on public.wa_owner_pin, public.wa_pin_attempts from public, anon, authenticated;
create function public.wa_verify_owner_pin(actor_id uuid, entered text) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
declare attempt public.wa_pin_attempts; stored text;
begin
  insert into public.wa_pin_attempts(actor) values(actor_id) on conflict do nothing;
  select * into strict attempt from public.wa_pin_attempts where actor=actor_id for update;
  if attempt.next_try > now() then return false; end if;
  select pin_hash into stored from public.wa_owner_pin where singleton;
  if stored is not null and entered ~ '^[0-9]{4}$' and extensions.crypt(entered,stored)=stored then
    delete from public.wa_pin_attempts where actor=actor_id;
    return true;
  end if;
  update public.wa_pin_attempts set failures=(failures+1)%5,
    next_try=case when failures>=4 then now()+interval '15 minutes' end where actor=actor_id;
  return false;
end $$;
revoke all on function public.wa_verify_owner_pin(uuid,text) from public,anon,authenticated;
grant execute on function public.wa_verify_owner_pin(uuid,text) to service_role;

create function public.wa_robot_report(period_days integer) returns jsonb
language sql stable set search_path=public,pg_temp as $$
  with bounds as (
    select case when period_days in (1,7,30) then
      (((now() at time zone 'America/Sao_Paulo')::date - (period_days-1))::timestamp at time zone 'America/Sao_Paulo')
      else '-infinity'::timestamptz end as since
  ), messages as (
    select count(*) filter(where direction='in') received,
      count(distinct session_id) filter(where direction='in') contacts,
      count(*) filter(where direction='out' and author='bot' and status<>'failed') sent,
      count(*) filter(where direction='out' and author='agent' and status<>'failed') human,
      count(*) filter(where direction='out' and author='bot' and status='failed') failed
    from wa_messages,bounds where created_at>=since
  ), sales as (
    select count(distinct o.id) orders, count(distinct j.session_id) buyers,
      coalesce(sum(o.total_cents),0) revenue
    from (select distinct on (order_result->>'id') order_result->>'id' as id, session_id
      from wa_jobs where order_result->>'id' is not null order by order_result->>'id',created_at,id) j
    join orders o on o.id::text=j.id cross join bounds
    where o.created_at>=since and o.status<>'cancelled' and o.deleted_at is null
  ), pending as (
    select count(*) carts,coalesce(sum((pending#>>'{quote,total}')::bigint),0) pipeline
    from wa_sessions s where not paused and (pending->>'expires')::timestamptz>now()
      and jsonb_typeof(pending#>'{quote,total}')='number'
      and not exists(select 1 from orders o where o.source_idempotency_key=s.pending#>>'{basket,idempotencyKey}')
  )
  select to_jsonb(messages)||to_jsonb(sales)||to_jsonb(pending) from messages,sales,pending;
$$;
revoke all on function public.wa_robot_report(integer) from public,anon,authenticated;
grant execute on function public.wa_robot_report(integer) to service_role;

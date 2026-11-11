-- Número do pedido contínuo: não volta para 1 a cada dia (se o último foi 40, o próximo é 41).
-- business_date continua marcando o dia do pedido; só a contagem deixa de reiniciar.
create table if not exists private.order_display_counter (
  id boolean primary key default true check (id),
  last_number integer not null default 0
);
alter table private.order_display_counter enable row level security;
revoke all on private.order_display_counter from public,anon,authenticated;
grant select,insert,update on private.order_display_counter to service_role;
insert into private.order_display_counter(id,last_number)
  values(true,coalesce((select daily_number from public.orders order by created_at desc,number desc limit 1),0))
  on conflict(id) do nothing;

create or replace function private.assign_daily_order_number() returns trigger
language plpgsql security invoker set search_path=public,private as $$
begin
  new.business_date := (coalesce(new.created_at,now()) at time zone 'America/Sao_Paulo')::date;
  insert into private.order_display_counter(id,last_number) values(true,1)
  on conflict(id) do update set last_number=order_display_counter.last_number+1
  returning last_number into new.daily_number;
  return new;
end $$;
revoke all on function private.assign_daily_order_number() from public,anon,authenticated;
grant execute on function private.assign_daily_order_number() to service_role;

insert into public.system_migrations(version,name) values(49,'continuous_order_number') on conflict(version) do nothing;

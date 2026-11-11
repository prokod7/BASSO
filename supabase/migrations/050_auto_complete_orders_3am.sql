-- Às 3h (Brasília) todo pedido ainda em aberto de antes desse horário é concluído automaticamente.
-- Usa a mesma função da operação (histórico, auditoria, entregador liberado); não baixa pagamento.
create or replace function private.auto_complete_open_orders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Último 03:00 de Brasília.
  v_cutoff timestamptz := (date_trunc('day', (now() at time zone 'America/Sao_Paulo') - interval '3 hours') + interval '3 hours') at time zone 'America/Sao_Paulo';
  v_id text;
  v_done integer := 0;
begin
  for v_id in
    select id from public.orders
     where deleted_at is null
       and status in ('received','confirmed','preparing','ready','out_for_delivery')
       and created_at < v_cutoff
  loop
    begin
      perform public.change_order_status_controlled(v_id, 'completed', 'Concluído automaticamente às 3h', null, null);
      v_done := v_done + 1;
    exception when others then
      raise warning 'auto_complete_open_orders: pedido % não concluído: %', v_id, sqlerrm;
    end;
  end loop;
  return v_done;
end $$;

revoke all on function private.auto_complete_open_orders() from public,anon,authenticated;
grant execute on function private.auto_complete_open_orders() to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'basso-auto-complete-3am';
    -- 06:00 UTC = 03:00 em Brasília (sem horário de verão).
    perform cron.schedule('basso-auto-complete-3am', '0 6 * * *', 'select private.auto_complete_open_orders()');
  end if;
end $$;

insert into public.system_migrations(version,name) values(50,'auto_complete_orders_3am') on conflict(version) do nothing;

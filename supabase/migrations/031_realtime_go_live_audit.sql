-- 031_realtime_go_live_audit.sql
-- Habilita eventos Postgres Changes usados pelo painel operacional Basso.
-- Tabelas continuam protegidas pelas políticas RLS existentes.
-- Não publica dados de clientes, auditoria ou destinatários de campanha.

begin;

alter publication supabase_realtime add table
  public.orders,
  public.order_items,
  public.payments,
  public.restaurant_tables,
  public.tabs,
  public.drivers,
  public.inventory_items,
  public.coupons,
  public.cash_sessions,
  public.cash_movements,
  public.financial_entries,
  public.integration_events,
  public.store_runtime_status,
  public.operation_tasks,
  public.approval_requests,
  public.internal_notifications,
  public.print_jobs,
  public.campaigns;

create or replace function public.pedidopro_realtime_health()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $fn$
  with required(name) as (
    values ('orders'), ('order_items'), ('payments'), ('restaurant_tables'), ('tabs'), ('drivers'), ('store_runtime_status'), ('internal_notifications'), ('print_jobs'), ('inventory_items')
  ), missing as (
    select r.name from required r
    where not exists (
      select 1 from pg_catalog.pg_publication_tables t
      where t.pubname = 'supabase_realtime'
        and t.schemaname = 'public'
        and t.tablename = r.name
    )
  )
  select pg_catalog.jsonb_build_object(
    'required', (select count(*) from required),
    'published', (select count(*) from required) - (select count(*) from missing),
    'missing', coalesce((select pg_catalog.jsonb_agg(name) from missing), '[]'::jsonb)
  );
$fn$;

revoke all on function public.pedidopro_realtime_health() from public, anon, authenticated;
grant execute on function public.pedidopro_realtime_health() to service_role;

insert into public.system_migrations(version, name)
values (31, 'realtime_go_live_audit')
on conflict (version) do update set name = excluded.name;

commit;

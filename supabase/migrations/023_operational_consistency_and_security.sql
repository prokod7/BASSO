-- 023_operational_consistency_and_security.sql
-- Fecha a regressão de privilégio introduzida pela migration 022 e registra a
-- base mínima exigida pela release MU13.

begin;

-- A geração de jobs de impressão contém payload operacional completo do pedido
-- e é executada somente por rotas server-side com service_role. Usuários do
-- navegador nunca devem chamar esta SECURITY DEFINER diretamente pela Data API.
revoke execute on function public.enqueue_order_print_jobs(text) from public;
revoke execute on function public.enqueue_order_print_jobs(text) from anon;
revoke execute on function public.enqueue_order_print_jobs(text) from authenticated;
grant execute on function public.enqueue_order_print_jobs(text) to service_role;

insert into public.system_migrations(version, name)
values (23, 'operational_consistency_and_security')
on conflict (version) do update set name = excluded.name;

commit;

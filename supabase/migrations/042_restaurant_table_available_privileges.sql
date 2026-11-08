-- 042: restaurant_table_available é usada só dentro das funções de mesa (security definer).
-- Remove a execução direta por usuários logados via API (aviso do Supabase Advisor).
revoke execute on function public.restaurant_table_available(integer) from public, anon, authenticated;
grant execute on function public.restaurant_table_available(integer) to service_role;

insert into public.system_migrations(version,name) values(42,'restaurant_table_available_privileges') on conflict(version) do nothing;

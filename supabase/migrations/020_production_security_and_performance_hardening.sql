-- 020_production_security_and_performance_hardening.sql
-- Hardening de produção: helpers RLS privados, privilégios mínimos de RPC,
-- search_path seguro, RLS eficiente e índices de suporte para foreign keys.

-- Helpers usados nas policies não devem permanecer em um schema exposto pela Data API.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select role
  from public.profiles
  where id = auth.uid() and active
  limit 1
$$;

create or replace function private.can_manage_operation()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(private.current_role() in ('manager','counter','kitchen','bar','waiter'), false)
$$;

revoke execute on function private.current_role() from public, anon;
revoke execute on function private.can_manage_operation() from public, anon;
grant execute on function private.current_role() to authenticated, service_role;
grant execute on function private.can_manage_operation() to authenticated, service_role;

-- Reescreve policies existentes para usar os helpers privados e, portanto,
-- retirar a necessidade de executar helpers SECURITY DEFINER do schema public.
do $$
declare
  r record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ilike '%current_role%'
        or coalesce(with_check, '') ilike '%current_role%'
        or coalesce(qual, '') ilike '%can_manage_operation%'
        or coalesce(with_check, '') ilike '%can_manage_operation%'
      )
  loop
    v_using := r.qual;
    v_check := r.with_check;

    if v_using is not null then
      v_using := replace(v_using, 'private.can_manage_operation()', '__PRIVATE_CAN_MANAGE__');
      v_using := replace(v_using, '"current_role"()', '(select private.current_role())');
      v_using := replace(v_using, 'can_manage_operation()', '(select private.can_manage_operation())');
      v_using := replace(v_using, '__PRIVATE_CAN_MANAGE__', 'private.can_manage_operation()');
    end if;

    if v_check is not null then
      v_check := replace(v_check, 'private.can_manage_operation()', '__PRIVATE_CAN_MANAGE__');
      v_check := replace(v_check, '"current_role"()', '(select private.current_role())');
      v_check := replace(v_check, 'can_manage_operation()', '(select private.can_manage_operation())');
      v_check := replace(v_check, '__PRIVATE_CAN_MANAGE__', 'private.can_manage_operation()');
    end if;

    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;
    execute v_sql;
  end loop;
end
$$;

-- Policies apontadas pelo advisor por reavaliar auth.uid() a cada linha.
alter policy profiles_self_select on public.profiles
  using ((id = (select auth.uid())) or ((select private.current_role()) = 'manager'::public.app_role));

alter policy internal_notifications_read on public.internal_notifications
  using ((recipient_id = (select auth.uid())) or recipient_id is null or audience_role = (select private.current_role()));

-- Search path explícito nas funções apontadas pelo advisor.
alter function public.audit_immutable() set search_path = pg_catalog, public;
alter function public.assign_order_number() set search_path = pg_catalog, public;

-- Funções SECURITY DEFINER no schema público não devem ser endpoints RPC de navegador.
-- As rotas Next.js autenticam/autorizam e executam as operações privilegiadas via service_role.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public', r.signature);
    execute format('revoke execute on function %s from anon', r.signature);
    execute format('revoke execute on function %s from authenticated', r.signature);
    execute format('grant execute on function %s to service_role', r.signature);
  end loop;
end
$$;

-- Evita que novas funções voltem a herdar EXECUTE para papéis de navegador.
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from authenticated;

-- O schema extensions já faz parte do search_path do projeto. Remove o aviso de
-- extensão instalada em public sem alterar os OIDs/tipos já usados pelas tabelas.
do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'citext' and n.nspname = 'public'
  ) then
    alter extension citext set schema extensions;
  end if;
end
$$;

-- Cria índices de suporte somente para foreign keys sem índice de cobertura.
do $$
declare
  r record;
  v_index_name text;
  v_columns_sql text;
begin
  for r in
    select
      c.conrelid,
      n.nspname as schema_name,
      t.relname as table_name,
      c.conname,
      c.conkey,
      array_agg(a.attname order by u.ord) as columns
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    cross join lateral unnest(c.conkey) with ordinality u(attnum, ord)
    join pg_attribute a on a.attrelid = t.oid and a.attnum = u.attnum
    where c.contype = 'f'
      and n.nspname = 'public'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and i.indisready
          and (i.indkey::smallint[])[0:cardinality(c.conkey)-1] @> c.conkey
      )
    group by c.conrelid, n.nspname, t.relname, c.conname, c.conkey
  loop
    select string_agg(format('%I', col), ', ')
      into v_columns_sql
    from unnest(r.columns) col;

    v_index_name := left('idx_fk_' || r.conname, 54) || '_' || substr(md5(r.conname), 1, 8);
    execute format(
      'create index if not exists %I on %I.%I (%s)',
      v_index_name,
      r.schema_name,
      r.table_name,
      v_columns_sql
    );
  end loop;
end
$$;

-- As tabelas abaixo são internas e devem continuar deny-by-default via RLS.
comment on table public.client_error_events is 'Internal observability table. RLS deny-by-default is intentional; clients write through controlled API routes.';
comment on table public.idempotency_keys is 'Internal idempotency table. RLS deny-by-default is intentional.';
comment on table public.order_access_tokens is 'Internal order access token table. RLS deny-by-default is intentional; access is mediated by server routes.';
comment on table public.price_history is 'Internal price audit table. RLS deny-by-default is intentional.';
comment on table public.sync_queue is 'Internal synchronization queue. RLS deny-by-default is intentional.';
comment on table public.tracking_tokens is 'Internal tracking token table. RLS deny-by-default is intentional; public tracking is mediated by server routes.';

insert into public.system_migrations(version, name)
values (20, 'production_security_and_performance_hardening')
on conflict (version) do update set name = excluded.name;

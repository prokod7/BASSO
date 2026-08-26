-- 020_production_security_and_performance_hardening.sql
-- Hardening de produção: privilégios mínimos de RPC, search_path seguro,
-- RLS mais eficiente e índices de suporte para foreign keys.

alter function public.audit_immutable() set search_path = pg_catalog, public;
alter function public.assign_order_number() set search_path = pg_catalog, public;

-- Funções SECURITY DEFINER não devem ser endpoints RPC públicos por padrão.
-- As rotas Next.js internas já autenticam/autorizam o usuário e executam as
-- operações privilegiadas através do service_role no servidor.
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

-- Estes dois helpers são chamados por policies RLS de usuários autenticados.
-- Eles permanecem como exceções intencionais e não são liberados para anon.
grant execute on function public.current_role() to authenticated;
grant execute on function public.can_manage_operation() to authenticated;

-- Evita reavaliar auth.uid() para cada linha nas policies mais acessadas.
alter policy profiles_self_select on public.profiles
  using ((id = (select auth.uid())) or (public.current_role() = 'manager'::public.app_role));

alter policy internal_notifications_read on public.internal_notifications
  using ((recipient_id = (select auth.uid())) or recipient_id is null or audience_role = public.current_role());

-- Cria índices de suporte somente para foreign keys que ainda não possuem um
-- índice válido cobrindo as colunas da relação. O nome inclui hash para evitar
-- colisões no limite de 63 caracteres do PostgreSQL.
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

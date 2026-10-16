-- Mantém validação de token privado e resolve pgcrypto no schema correto.
do $migration$ declare f record; begin
  for f in select p.oid,pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('get_public_order','get_public_tracking')
  loop
    execute replace(f.definition,'encode(digest(', 'encode(extensions.digest(');
  end loop;
end $migration$;
insert into public.system_migrations(version,name) values(36,'fix_private_tracking_crypto_schema') on conflict(version) do nothing;

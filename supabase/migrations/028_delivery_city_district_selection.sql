-- 028_delivery_city_district_selection.sql
-- A cobertura de entrega passa a identificar explicitamente cidade + bairro.
-- Isso evita colisões de bairros homônimos entre municípios e permite seletores
-- dependentes no checkout/PDV sem depender de texto livre.

begin;

alter table public.delivery_zones
  add column if not exists city text;

update public.delivery_zones
set city = trim(split_part(name, ' — ', 1))
where city is null
  and position(' — ' in name) > 0;

-- A base atual foi importada com o padrão "Cidade — Bairro".
-- Falhar a migration é preferível a assumir silenciosamente uma cidade errada.
do $$
begin
  if exists (
    select 1
    from public.delivery_zones
    where deleted_at is null
      and (city is null or btrim(city) = '')
  ) then
    raise exception 'Existem zonas de entrega sem cidade definida. Corrija os registros antes de concluir a migration 028.';
  end if;
end $$;

alter table public.delivery_zones
  alter column city set not null;

create index if not exists delivery_zones_city_active_idx
  on public.delivery_zones (city, active)
  where deleted_at is null;

insert into public.system_migrations(version, name)
values (28, 'delivery_city_district_selection')
on conflict (version) do update set name = excluded.name;

commit;

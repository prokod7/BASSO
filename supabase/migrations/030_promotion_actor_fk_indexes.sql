-- 030_promotion_actor_fk_indexes.sql
-- Completa a cobertura dos FKs de auditoria do módulo de promoções.

begin;

create index if not exists promotions_created_by_idx
  on public.promotions(created_by)
  where created_by is not null;

create index if not exists promotions_updated_by_idx
  on public.promotions(updated_by)
  where updated_by is not null;

insert into public.system_migrations(version, name)
values (30, 'promotion_actor_fk_indexes')
on conflict (version) do update set name = excluded.name;

commit;

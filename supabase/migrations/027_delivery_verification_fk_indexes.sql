-- 027_delivery_verification_fk_indexes.sql
-- Fecha os avisos de FK sem índice introduzidos pelo MU15.

begin;

create index if not exists delivery_verifications_pickup_verified_by_idx
  on public.delivery_verifications(pickup_verified_by)
  where pickup_verified_by is not null;

create index if not exists delivery_verifications_pickup_driver_idx
  on public.delivery_verifications(pickup_verified_driver_id)
  where pickup_verified_driver_id is not null;

create index if not exists delivery_verifications_delivery_verified_by_idx
  on public.delivery_verifications(delivery_verified_by)
  where delivery_verified_by is not null;

insert into public.system_migrations(version,name)
values (27,'delivery_verification_fk_indexes')
on conflict(version) do update set name=excluded.name;

commit;
